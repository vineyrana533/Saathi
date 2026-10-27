# Pricing and finance

Status: Implemented and tested for Milestone 1 (sandbox payments only). Last updated 27 October 2026.

Code: `src/modules/pricing/engine.ts`, `src/modules/catalog/config.ts`, `src/modules/payments/ledger.ts`, `src/modules/payments/service.ts`, `src/modules/bookings/service.ts`, `drizzle/0001_security.sql`.

Tax treatment in this document describes what the code does with the current configuration. It is not a tax conclusion. Every tax line is **Needs legal/CA confirmation** (see [decisions.md](decisions.md) L-03 to L-05).

## 1. Money rules

- All amounts are integer paise (`bigint` columns ending `_paise`). There is no floating point money anywhere.
- Rates are integer basis points (`_bps`): 2000 bps = 20%.
- `applyBps(amount, bps)` multiplies with `BigInt` and rounds half up: `(amount * bps + 5000) / 10000`. It throws on non-integer or negative input.
- Every line is rounded on its own. The engine then checks that the allocated amounts add up to the customer total exactly, and throws if they do not.

## 2. Pricing configuration

Pricing lives on `service_cities.pricing` (one row per service and city), validated by `pricingConfigSchema`:

| Field | Meaning |
|---|---|
| `currency` | Always `INR` |
| `model` | `hourly`, `daily` or `fixed` |
| `hourlyRatePaise`, `dailyRatePaise`, `fixedPaise` | Rate for the chosen model |
| `commissionBps` | Platform commission on the service amount (worker side) |
| `platformFee` | `{ bps, flatPaise }` charged to the customer on top of the service amount |
| `taxes[]` | Rules `{ code, label, base, rateBps, payer }`. `base` is `service`, `commission` or `platform_fee`. `payer` is `customer` (added to the total) or `worker` (deducted from earnings) |
| `tdsBps` | TDS on the service amount, deducted from the worker (0 by default) |

Service amount by model:

- `hourly`: `hourlyRatePaise * minutes / 60`, rounded half up.
- `daily`: `dailyRatePaise * ceil(minutes / 1440)`.
- `fixed`: `fixedPaise`.

Seeded staging configuration (`src/modules/catalog/seed.ts`, `DRIVER_PRICING`): hourly ₹250 (placeholder, decisions.md P-03), commission 20%, platform fee 0, one tax rule "GST on commission (18%)" with base `commission` and payer `worker`, TDS 0. Event staff and errands use the same shape with ₹300 and ₹200 placeholders.

Admins change prices in `/admin/catalog` (`updateServiceCityPricing`). Each change bumps `service_cities.pricing_version` and writes an audit entry with the old and new configuration.

## 3. The price snapshot

`computePrice()` returns a `PriceSnapshot`:

- `customer.lines` and `customer.totalPaise`: what the customer sees and pays (service line, booking fee if any, customer-side taxes).
- `worker.grossPaise`, `worker.deductions`, `worker.netPaise`: commission, worker-side taxes and TDS.
- `allocations`: how the customer total is split across ledger accounts (`worker_payable`, `commission_revenue`, `platform_fee_revenue`, `gst_output_payable`, `tds_payable`). Zero amounts are omitted.
- `pricing` and `pricingVersion`: the exact rules used.

The same function produces the quote shown on search and confirm pages, the snapshot stored on `bookings.price_snapshot`, and the completion journal. That is how "price shown = snapshot = ledger" holds by construction. Acceptance tests `m1-price-integrity` and `m1-price-snapshot` check it.

### The expected total check

The confirm page posts `expectedTotalPaise` (the total the customer saw). `createBooking` recomputes the price on the server inside the booking transaction. If the totals differ, it refuses with `409 price_changed` and returns the new total in `details.totalPaise`. A booking can therefore never be created at a price the customer was not shown.

### Price changes after booking

A confirmed booking keeps its own `price_snapshot` and `pricing_version`. Later price edits only affect new quotes. Completion posts amounts from the stored snapshot, never from current configuration.

## 4. Worked example: 4-hour personal driver booking

Configuration: `DRIVER_PRICING` (₹250 per hour placeholder).

| Step | Calculation | Paise | Rupees |
|---|---|---|---|
| Service amount | 25,000 × 240 / 60 | 100,000 | ₹1,000 |
| Platform fee | 0 bps + 0 flat | 0 | ₹0 |
| Customer total | service + fee + customer taxes | 100,000 | ₹1,000 |
| Commission | 20% of 100,000 | 20,000 | ₹200 |
| GST on commission (worker pays) | 18% of 20,000 | 3,600 | ₹36 |
| TDS | 0% | 0 | ₹0 |
| Worker net | 100,000 − 20,000 − 3,600 | 76,400 | ₹764 |

Allocations: `worker_payable` 76,400, `commission_revenue` 20,000, `gst_output_payable` 3,600. Total 100,000, equal to the customer total. This matches what the browser walkthrough on 28 October 2026 showed on the worker job page, the earnings page and the admin ledger table.

## 5. Cancellation fees

`cancellationFee(policy, totalPaise, hoursBeforeStart)` with the seeded policy `{ freeBeforeHours: 24, lateFeeBps: 5000, veryLateBeforeHours: 2, veryLateFeeBps: 10000 }`:

| Hours before start | Band | Fee |
|---|---|---|
| More than 24 | `free` | 0 |
| More than 2, up to 24 | `late` | 50% of total |
| 2 or less (including after start time) | `very_late` | 100% of total |

The fee applies only when the **customer** cancels a **confirmed** booking. Cancellation by the worker or staff, or of an unpaid booking, has no fee. The booking page shows the fee that would apply now (`cancelFeeNowPaise`).

## 6. Ledger

The double-entry ledger is the source of truth for money. There is no balance column anywhere. A balance is the sum of debits and credits on an account's lines.

### Accounts (`ledger_accounts`)

| Code | Kind | Owner |
|---|---|---|
| `gateway_clearing` | asset | none |
| `customer_funds_held` | liability | none |
| `worker_payable` | liability | one account per worker (`owner_type = 'worker'`) |
| `commission_revenue` | revenue | none |
| `platform_fee_revenue` | revenue | none |
| `gst_output_payable` | liability | none |
| `tds_payable` | liability | none |
| `refunds_payable` | liability | none |
| `cancellation_fee_revenue` | revenue | none |
| `payout_clearing` | asset | none (not used yet) |

Accounts are created on first use (`ensureAccount`), unique by code and owner.

### Journals posted today

| Kind | When | Idempotency key | Lines |
|---|---|---|---|
| `capture` | Verified `payment.captured` webhook (`handlePaymentWebhook`) | `capture:<paymentId>` | Dr `gateway_clearing` total; Cr `customer_funds_held` total |
| `completion` | Worker enters the correct end code (`finishJob`) | `completion:<bookingId>` | Dr `customer_funds_held` total; Cr each snapshot allocation (worker line on that worker's account) |
| `cancellation` | A **confirmed** booking is cancelled (`cancelBooking`) | `cancellation:<bookingId>` | Dr `customer_funds_held` total; Cr `refunds_payable` refundable part; Cr `cancellation_fee_revenue` fee |

`postJournal` skips zero lines, refuses unbalanced input, and returns `{ created: false }` when the idempotency key already exists. The `kind` check constraint also allows `refund`, `payout` and `adjustment`, which nothing posts yet.

### Database guarantees (`drizzle/0001_security.sql`)

- `ledger_lines_one_side_chk`: each line is a debit or a credit, never both or neither.
- `ledger_lines_balanced`: a constraint trigger, `DEFERRABLE INITIALLY DEFERRED`, that checks at commit that each journal's debits equal its credits. Its function is `SECURITY DEFINER`, because at commit the caller's row-level security context may hide some lines (a worker can see only their own payable line).
- `ledger_lines_immutable`, `journal_entries_immutable`, `audit_log_immutable`: `BEFORE UPDATE OR DELETE` triggers that reject any change. Corrections must be new journals.
- RLS: only the system context can insert journals or lines. Finance and admin read everything; a worker reads only lines on their own `worker_payable` account.

### Worker earnings

`workerEarnings()` sums credits on the worker's `worker_payable` account, joined to the booking ref. The worker sees this at `/worker/earnings`. Payouts are not built, so the page says payouts are not switched on yet.

## 7. Payments

States in `payments.status`: `created`, `captured`, `failed`, `partially_refunded`, `refunded`.

Implemented transitions:

| From | To | Trigger |
|---|---|---|
| (none) | `created` | Booking creation creates a gateway order |
| `created` | `failed` | Verified `payment.failed` event |
| `created` or `failed` | `captured` | Verified `payment.captured` event with matching amount |

Safeguards in `handlePaymentWebhook`:

- The signature is verified before anything is stored, so a forged event cannot claim an event id.
- `payment_webhook_events (provider, event_id)` is unique. A replay returns `duplicate` and changes nothing.
- `payments.provider_payment_id` is unique and the capture journal has an idempotency key, so a second, different event for the same payment returns `already_captured`.
- An amount that does not match the order is recorded as `amount_mismatch` with an audit entry and nothing else changes.
- A capture that arrives after the hold expired or the booking was cancelled is recorded as `captured_needs_refund`. The capture journal is still posted (the money is held) and an audit entry is written. The refund itself is a Milestone 3 flow.

Only the sandbox gateway exists. It signs webhooks with HMAC-SHA256 using `SANDBOX_WEBHOOK_SECRET`, and the checkout page is labelled as a test. `paymentGateway()` throws if `PAYMENTS_MODE=live`, and `env()` refuses live mode in production unless `PAYMENTS_LIVE_APPROVED=true` (decisions.md V-01).

## 8. Not built yet

| Item | Milestone |
|---|---|
| Razorpay adapter (orders, signature, webhooks) and Cashfree as second adapter | After gateway approval, Milestone 3 |
| Refund execution (`refund` journals, gateway refunds, refund states) | Milestone 3 |
| Weekly payouts after the dispute window (`payout` journals, payout provider) | Milestone 3 |
| Daily reconciliation report against gateway and payout provider reports | Milestone 3 |
| Disputes and payout holds | Milestone 3 |
| GST-compliant invoices and consolidated corporate invoices | Needs legal/CA confirmation; Milestone 3 and later |
| Coupons, promotions, add-ons, deposits, distance pricing, quotes | Milestone 2 (quotes) and later |
| Worker share of cancellation fees | Pending sign-off; today the whole fee goes to `cancellation_fee_revenue` |
