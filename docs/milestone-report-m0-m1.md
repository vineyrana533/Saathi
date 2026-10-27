# Milestone report: Milestones 0 and 1

Date: 28 October 2026. Scope: foundations, plus the first end-to-end workflow (personal driver, Delhi NCR, direct booking). Everything runs locally against real PostgreSQL 17 with sandbox adapters. Nothing is deployed, committed or pushed yet.

## 1. What was built

- **M01 Platform foundation.** Next.js 16 modular monolith, environment validation, redacted structured logs, Postgres access that sets row-level security context on every transaction, migrations, i18n layer, cities and zones, rate limits, cron sweeps, health endpoint, CI workflow, Vercel config (region bom1, per-minute cron).
- **M02 Identity.** Phone OTP sign-in, sessions by cookie or Bearer token, role matrix, consent records with versions, append-only audit log, RLS on every table with a non-owner app role.
- **M03 Catalogue.** Four services configured by validated JSON (driver, event staff, errands, gated companion), risk tiers, feature flag for Tier B, per-city status and pricing with versions.
- **M04 and M05 Workers and availability.** Registration, encrypted document upload, verifier queue, per-service approval, activation rules, expiry sweep, weekly hours, exclusion-constraint double-booking guard.
- **M07 and M08 Booking and pricing.** Direct booking with re-checks under a row lock, payment hold, start and end codes, completion, cancellation by policy, pricing engine with snapshots.
- **M13 Payments and ledger.** Sandbox gateway with signed webhooks, idempotent processing, double-entry ledger with a database balance check, worker earnings.
- **M16, M19, M20.** Booking chat with contact and prohibited-content filter, reports, two-way ratings.
- **M06, M10, M18 Interfaces.** Customer site, mobile-first worker portal, operations dashboard, all on the original Saathi design system.
- **M23 SEO.** Database-generated city and service pages, supply-based indexing, per-request sitemap, structured data.

## 2. What was tested

| Check | Result |
|---|---|
| Type check | 0 errors |
| Lint | 0 problems |
| Production build | Succeeds, 50 routes |
| Vitest, real PostgreSQL 17 | 117 tests in 18 files, all pass |
| Milestone 1 acceptance tests | 10 of 10 pass |
| Manual browser pass | Search, sign-in, booking, failed and successful sandbox payment, chat blocking, worker start and finish codes, earnings, admin ledger view, Mumbai waitlist page, phone layout and mobile menu |

Bugs found by tests and the browser pass, and fixed: ledger balance check hidden by RLS at commit; staging pages indexable; forms clearing on error; header button showing on phones; start code staying in the end-code field.

## 3. Not done yet

- Milestones 2 and 3 scope: assisted matching, quotes, refunds execution, payouts, SOS, live location, check-ins, masked calling, incidents, disputes, no-show handling.
- Real vendors: payments, SMS, KYC, police verification, storage, email, error monitoring. All run as clearly labelled sandbox or dev adapters.
- Staging deployment: needs Supabase and Vercel access, and a Supabase Storage adapter for uploads.
- Automated browser and accessibility tests, licensed photography, Hindi content.

## 4. Risks and limitations

- Live payments are blocked until the gateway confirms the categories in writing.
- Prices are placeholders, and the 10-worker go-live threshold is unconfirmed.
- Chat is not real-time.
- Seed sample drivers exist only in local and staging and are named "Sample".
- Tax treatment (GST on commission, TDS) is configuration awaiting CA confirmation.

## 5. Decisions needed

See the chat summary and [decisions.md](decisions.md) sections 3 to 5.

## 6. Tracker

See [module-status.md](module-status.md).
