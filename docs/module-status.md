# Module status

Last updated 28 October 2026, end of Milestones 0 and 1 (pre-launch build, local and staging-grade only).

Statuses: Not Started, Specification Complete, In Progress, Implemented, Tested, Verified, Blocked. **Verified** means the module's required tests ran and passed. "Manual" means checked by hand in the browser, not by an automated test.

Latest automated run: type check clean, lint clean, production build succeeds, and the full Vitest suite passes against real PostgreSQL 17 (see the milestone report for counts). CI is defined in `.github/workflows/ci.yml` but has not run on GitHub yet because nothing has been pushed.

## Tracker

| ID | Module | v1 | Status | What exists | What is missing or simulated |
|---|---|---|---|---|---|
| M01 | Platform Foundation | Yes | Verified (M0 scope) | Next.js 16 app, env validation, structured logs with PII redaction, error mapping, Postgres access with per-request RLS context, migrations, i18n layer, cities and zones, rate limits, jobs runner, health endpoint, CI workflow | CI not yet run on GitHub. Error monitoring and uptime vendors not chosen (V-08). Backups depend on Supabase plan |
| M02 | Identity, Users, Roles, Organisations | Yes | Verified (M1 scope) | Phone OTP login, hashed OTPs, attempt limits, DB sessions (cookie or Bearer), roles matrix, consent records, audit log (append-only), RLS on every table, customer ID check (upload in account, verifier review, encrypted file, audit logged views; T-32) | SMS vendor pending (dev-log adapter, fixed code for test phones only). Agency and corporate isolation policies come with M11/M12 |
| M03 | Configurable Service Catalogue | Yes | Verified (M1 scope) | Seven services across tiers A, B and C. Six are bookable online in Delhi NCR (T-31), including Tier C elder care, domestic help and medical support behind their feature flags; social companion (Tier B) is off. Categories by risk tier, Zod-validated service config and pricing config, per-city status, feature flags for Tier B and C, admin price and status editing with pricing versions | No admin UI to create new categories, edit full service config or switch flags yet (done by seed or SQL). Prices are placeholders (P-03, P-09). Tier C legal items L-11 to L-13 open |
| M04 | Worker and Provider Management | Yes | Verified (M1 scope) | Worker profile, encrypted document upload with type sniffing and size limits, verifier queue, applications for any open service with that service's extra documents (T-34), per-service approval, activation rules, expiry sweep that suspends approvals, audit logged document views | KYC and police verification vendors pending: manual review adapter (V-04, V-05). No selfie match yet |
| M05 | Availability and Scheduling | Yes | Verified (M1 scope) | Weekly hours, time off (service), overlap protection by exclusion constraint, payment holds with expiry | No time-off UI yet. No overnight bookings (by design for drivers) |
| M06 | Customer Experience | Yes | Tested (manual) | Home, city and service pages, search, worker profiles, confirm with price breakdown, sandbox checkout, booking page with codes, chat, cancel, rating, report, account, sign-in, content pages | No automated browser tests or axe checks yet. Licensed photography not sourced (labelled placeholders). Chat is not real-time (updates on send or reload) |
| M07 | Booking and Service Request Engine | Yes | Verified (Milestone 2) | Direct booking with server re-checks under lock; assisted requests with owner, 2-business-hour first-response deadline, status history and DB transition guard; team bookings with several assignments, partial fill and per-person pay; start and end OTP; cancellation by policy; hold, quote and request expiry | Job offers to workers, auto-matching, refunds for partial fill: Milestone 3 |
| M08 | Pricing and Quotations | Yes | Verified (hourly, quotes) | Pricing engine with team pricing, snapshots, allocations, cancellation fee bands; quotes with versions, 48-hour validity, accept and pay, ask for changes, decline, withdraw | Add-ons, coupons, subscriptions not started |
| M09 | Matching and Dispatch | Yes | In Progress | Customer chooses from eligible, available workers; gender filter; worker customer-gender preference honoured; ops suggestions for requests and for empty places on bookings, using the same eligibility query; manual assignment | Automatic matching and job offers: Milestone 3 |
| M10 | Worker Portal | Yes | Tested (manual) | Dashboard with approval checklist, profile, documents, hours, jobs with start and end code entry, chat, unsafe cancel, earnings from the ledger | Job offers with accept or decline (needed for assisted matching), notifications inbox, SOS: Milestones 2 and 3 |
| M11 | Agency and Partner Portal | After v1 | Not Started | Data model has organisations and workforce model | Milestone 5 |
| M12 | Corporate Customer Portal | After v1 | Not Started | | Later |
| M13 | Payments, Ledger, Earnings, Payouts | Yes | Verified (sandbox capture, ledger); Blocked (live) | Sandbox gateway with signed webhooks, idempotent processing, double-entry ledger with DB balance check, capture, completion and cancellation journals, worker earnings | Live payments blocked on gateway category approval (V-01). Refund execution, payouts and daily reconciliation: Milestone 3 |
| M14 | Subscriptions and Monetisation | After v1 | Not Started | | |
| M15 | CRM and Follow-up Automation | Basic in v1 | In Progress | Waitlist capture and demand view; "something else" requests stored with content checks and listed for ops (tested) | Owners, follow-ups, status changes and automations: Milestones 2 and 4 |
| M16 | Communication Centre | Yes | In Progress | In-app chat with leakage filter, notification outbox with idempotency keys, dev SMS adapter | Masked calling, real SMS and email vendors, push: Milestone 3 |
| M17 | AI and Voice Assistant | After v1 | Not Started | | |
| M18 | Admin and Operations | Yes | In Progress | Live overview counts, verification queue (workers and customer IDs), workers, request queue with owner and deadlines, quote builder, bookings list with "places still to fill" filter, booking detail with team filling and ledger, prices and city status, moderation (read-only), waitlist | Resolving flags and reports, incident and dispute handling, refunds, role management UI: Milestone 3 |
| M19 | Trust, Safety, Disputes | Yes | In Progress | Start and end codes, chat and profile leakage filter, prohibited-content scanner, one-tap report, code of conduct with stored version, unsafe cancel without penalty | SOS, live location, check-ins, masked calling, incidents, disputes, suspension workflow: Milestone 3. Public launch gate not met |
| M20 | Reviews and Quality | Yes | Verified | Two-way ratings after completion, once per direction, low-score flags, worker averages, visible reviews on profiles | Review moderation actions (hide, restore): Milestone 3 |
| M21 | Analytics and Reporting | Basic in v1 | Not Started | Ops overview counts only | GA4 with consent and funnel events, dashboards: Milestone 4 |
| M22 | Integrations, Monitoring, Reliability | Yes | In Progress | Adapter interfaces, rate limits, health check, redacted logs, cron endpoint. Staging live on Vercel (Tokyo) with Supabase database and encrypted document storage, behind a password gate, verified with a full booking on the live site | Error monitoring, uptime, backup restore drill, staging deployment (needs Supabase and Vercel access) |
| M23 | SEO and City/Service Pages | Yes | Verified | DB-generated city and service pages, indexable only when live with enough supply and in production, per-request sitemap, robots, canonical, structured data | GA4 and Search Console setup (documented, not installed), Hindi hreflang when Hindi ships |

## Milestone 1 acceptance tests

All ten pass. Mapping in [implementation-roadmap.md](implementation-roadmap.md) and [testing-strategy.md](testing-strategy.md).

| Criterion | Test file | Result |
|---|---|---|
| Cannot book unverified, unapproved, out-of-area or double-booked worker | `tests/acceptance/m1-eligibility.test.ts` | Pass |
| Simultaneous bookings for one slot: exactly one succeeds | `tests/acceptance/m1-concurrency.test.ts` | Pass |
| Price shown = snapshot = ledger | `tests/acceptance/m1-price-integrity.test.ts` | Pass |
| Price change does not alter a confirmed booking | `tests/acceptance/m1-price-snapshot.test.ts` | Pass |
| Replayed webhook creates one payment | `tests/acceptance/m1-webhook-idempotency.test.ts` | Pass |
| Job cannot start without the correct OTP | `tests/acceptance/m1-start-otp.test.ts` | Pass |
| Expired licence removes driver from search | `tests/acceptance/m1-document-expiry.test.ts` | Pass |
| Chat blocks a phone number | `tests/acceptance/m1-chat-filter.test.ts` | Pass |
| Workers and customers cannot see others' bookings, even via the API | `tests/acceptance/m1-data-isolation.test.ts` | Pass |
| Sitemap within one deploy of going live; noindex below threshold | `tests/acceptance/m1-seo-sitemap.test.ts` | Pass |
