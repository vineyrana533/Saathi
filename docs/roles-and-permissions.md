# Roles and permissions

Status: Specification Complete; enforced in code from Milestone 0 (`src/platform/auth/permissions.ts`) and in Postgres RLS (see [database-design.md](database-design.md) section 4). Last updated 27 October 2026.

## 1. Roles

| Role | Who | Scope |
|---|---|---|
| `customer` | Anyone who books | Own account, bookings, payments, chats, ratings, reports |
| `worker` | Independent, company-managed or agency worker | Own profile, documents, availability, assigned jobs, earnings |
| `verifier` | Trust and safety staff | Verification queues, documents, category approvals |
| `ops` | Operations staff | Bookings, requests, quotes, matching, incidents, chats for support |
| `support` | Customer support | Read bookings and chats, raise incidents, cannot change money |
| `finance` | Finance staff | Payments, ledger, refunds, payouts, reconciliation |
| `admin` | Platform administrators | Everything above plus catalogue, pricing, config, roles, feature flags, audit log |
| `agency_admin` | Agency or partner manager (Milestone 5) | Own agency's workers, allocations, settlements only |
| `corporate_admin` | Corporate account manager (later) | Own company's bookers, bookings, invoices only |
| `system` | Verified webhooks and cron jobs | Machine context, never assigned to a person |

A person can hold several roles, for example `customer` and `worker`. Staff roles are granted only by an admin and every grant is audit logged.

## 2. Permission matrix

Legend: **Y** allowed, **Own** only rows the user owns or is party to, **Org** only rows of the user's organisation, blank means denied.

| Permission | customer | worker | verifier | ops | support | finance | admin | agency_admin | corporate_admin |
|---|---|---|---|---|---|---|---|---|---|
| `catalog.read` | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| `catalog.manage` (services, pricing, cities, zones, flags) | | | | | | | Y | | |
| `config.manage` (business defaults) | | | | | | | Y | | |
| `worker.search` | Y | | Y | Y | Y | | Y | Org | Y |
| `worker.profile.read_public` | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| `worker.profile.manage` | | Own | | | | | Y | Org | |
| `worker.documents.upload` | | Own | | | | | Y | Org | |
| `worker.documents.read` | | Own | Y | | | | Y | | |
| `worker.verify` (approve or reject documents and categories) | | | Y | | | | Y | | |
| `worker.availability.manage` | | Own | | Y | | | Y | Org | |
| `customer.id.submit` (ID check for Tier B and C bookings) | Own | | | | | | | | |
| `customer.id.review` (approve or reject customer IDs; every file view logged) | | | Y | | | | Y | | |
| `request.create` (ask for a quote, answer quotes, cancel own requests) | Own | | | | | | | | |
| `request.manage` (request queue, ownership, quotes) | | | | Y | | | Y | | |
| `booking.assign` (fill or empty places on a booking before it starts) | | | | Y | | | Y | | |
| `booking.create` | Y | | | Y | | | Y | | Y |
| `booking.read` | Own | Own | | Y | Y | Y | Y | Org | Org |
| `booking.cancel` | Own | Own | | Y | | | Y | | Org |
| `booking.start_finish` (OTP) | | Own | | | | | | | |
| `booking.mark_no_show` | | Own | | Y | | | Y | | |
| `chat.read_write` | Own | Own | | Y | Y | | Y | | |
| `chat.moderate` | | | Y | Y | | | Y | | |
| `rating.create` | Own | Own | | | | | | | |
| `rating.moderate` | | | | Y | | | Y | | |
| `report.create` | Y | Y | | Y | Y | | Y | Y | Y |
| `payment.read` | Own | | | Y | Y | Y | Y | | Org |
| `ledger.read` | | Own (earnings) | | | | Y | Y | Org (settlements) | |
| `refund.approve` (Milestone 3) | | | | | | Y | Y | | |
| `payout.manage` (Milestone 3) | | | | | | Y | Y | | |
| `incident.manage` (Milestone 3) | | | | Y | Y | | Y | | |
| `user.roles.manage` | | | | | | | Y | | |
| `audit.read` | | | | | | | Y | | |

## 3. Enforcement layers

1. **Route guard.** Pages under `/admin` require a staff role. Pages under `/worker` require the worker role. Unauthenticated users are redirected to sign in.
2. **Service check.** Each service function calls `requirePermission(ctx, 'booking.read')`, then applies the **Own** or **Org** filter in its query.
3. **Row-level security.** Even if a service forgot the filter, RLS returns no rows the role should not see. Acceptance test `tests/acceptance/m1-data-isolation.test.ts` calls the API directly as another customer and another worker and expects 404.
4. **Audit.** Every write and every read of identity documents writes `audit_log`.

## 4. Worker rights that override defaults

- A worker can decline any job offer, and cancel a confirmed booking marked "I feel unsafe", without penalty. Ops is alerted and looks for a replacement.
- A worker's gender preference for customers is honoured in matching (Milestone 2 onward for assisted matching; direct search hides the worker for customers outside their preference).
