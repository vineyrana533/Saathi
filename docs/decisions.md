# Decisions log

Every value marked "Pending sign-off" is built as configuration, so it can change without code changes. Legal and tax items are marked "Needs legal/CA confirmation" and are not legal conclusions. Last updated 27 October 2026.

Status values: **Decided** (technical, recorded with reason), **Approved starting value** (business default approved on 27 October 2026), **Pending sign-off** (proposed default, needs internal approval), **Needs legal/CA confirmation**, **Open: vendor** (vendor not chosen; sandbox or dev adapter in use), **Launch blocker** (must be resolved before real customers or live payments).

## 1. Technical decisions

| ID | Decision | Status | Reason and notes |
|---|---|---|---|
| T-01 | Modular monolith on Next.js 16.4 App Router, React 19.3, TypeScript 5.9 strict, Tailwind CSS 4.3, Drizzle ORM 0.45, postgres.js, Zod 4, Vitest 5, pnpm 10 | Decided | Repository was empty on 27 Oct 2026, so section 14's default stack applies. TypeScript 5.9 rather than 7.0 because Next.js build-time type checking is proven on 5.x. |
| T-02 | Drizzle over Prisma | Decided | SQL-first migrations we can review, no query engine binary in serverless functions, easy hand-written SQL for RLS, triggers and exclusion constraints. |
| T-03 | Local dev and tests use real PostgreSQL 17 binaries from `@embedded-postgres/*` npm packages, driven by `initdb` and `pg_ctl` | Decided | No Docker or system Postgres on the dev machine. `pg_ctl` is required on Windows because Postgres refuses to run with administrator rights and `pg_ctl` drops them. Same engine and extensions as production. |
| T-04 | Own phone OTP authentication and database sessions instead of Supabase Auth | Decided | Supabase phone auth still needs an SMS vendor, and our authorisation model (RLS keyed on per-transaction settings, multi-role users, staff roles) is simpler to own end to end. Session tokens are opaque and hashed at rest. Revisit if we adopt Supabase client SDKs in mobile apps. |
| T-05 | Authorisation via code permission matrix plus Postgres RLS, app connects as non-owner role `saathi_app` | Decided | Section 12E requires isolation at the database level as well as in the API. |
| T-06 | Supabase Storage for documents in staging and production; local encrypted filesystem in dev; AES-256-GCM app-level encryption in both | Decided, needs Supabase access | Documents stay encrypted even if a bucket is misconfigured. Key in `DOCUMENT_ENCRYPTION_KEY`. Key rotation plan due in Milestone 3. |
| T-07 | Background jobs as Postgres `jobs` rows, run by `/api/cron/run` (Vercel Cron) and `pnpm jobs:run` | Decided | No extra vendor. Per-minute Vercel Cron needs a paid Vercel plan: confirm plan when deploying. |
| T-08 | Own typed i18n catalogue (`src/i18n`) instead of a library | Decided | English only at launch, tiny surface, no routing changes until Hindi ships. Can switch to next-intl later without touching call sites (`t('key')`). |
| T-09 | Money as integer paise in `bigint`, rates as integer basis points, rounding half up at line level | Decided | Section 3 and 10. |
| T-10 | Double-booking prevented by a Postgres exclusion constraint plus a worker row lock in the booking transaction | Decided | Correct under concurrency even across serverless instances. |
| T-11 | Payment hold: a `pending_payment` booking reserves the worker for 15 minutes | Pending sign-off | Config `booking.payment_hold_minutes`. |
| T-12 | Login OTP: 6 digits, 5 minutes, 5 attempts; booking start and end OTP: 4 digits, 5 attempts | Pending sign-off | Config. |
| T-13 | Start window: a job can start from 60 minutes before to 120 minutes after the scheduled start | Pending sign-off | Config `booking.start_window`. |
| T-14 | Rate limits (OTP request 3 per 10 minutes per phone and 10 per hour per IP; booking create 10 per hour per user; search 60 per minute per IP) | Pending sign-off | Config. |
| T-15 | Hosting regions: Vercel `bom1`, Supabase `ap-south-1` | Decided, needs account access | Section 14. |

## 2. Business defaults (section 16), approved as starting values on 27 October 2026

All stored in `config_values` and editable per city and per service.

| ID | Setting | Value | Status |
|---|---|---|---|
| B-01 | Platform commission | 20% of service price (2000 bps) | Approved starting value |
| B-02 | Minimum booking | 2 hours; personal driver 4 hours | Approved starting value |
| B-03 | Booking lead time | 3 hours; assisted requests 24 hours | Approved starting value |
| B-04 | Free cancellation | More than 24 hours before start | Approved starting value |
| B-05 | Late cancellation fee | 50% between 24 and 2 hours before start | Approved starting value |
| B-06 | Very late cancellation or customer no-show | 100% | Approved starting value |
| B-07 | Worker no-show | Full customer refund, worker strike, ops tries a replacement | Approved starting value |
| B-08 | Quote validity | 48 hours | Approved starting value |
| B-09 | First response on assisted requests | Within 2 business hours | Approved starting value |
| B-10 | Worker payouts | Weekly, after completion and dispute window | Approved starting value |
| B-11 | Dispute window | 48 hours after completion | Approved starting value |
| B-12 | Companion bookings (Tier B, when enabled) | Public venues only, 9 am to 10 pm, max 4 hours, verified customers only | Approved starting value |

## 3. Proposed defaults needing internal sign-off

| ID | Setting | Proposed value | Status |
|---|---|---|---|
| P-01 | City-service go-live threshold (section 17) | 10 verified, active, eligible workers per service and city | Pending sign-off |
| P-02 | Incident response targets | SOS acknowledged in 2 minutes; safety complaints in 1 hour; other complaints in 1 business day | Pending sign-off |
| P-03 | Personal driver price, Delhi, Noida, Gurugram | ₹250 per hour, placeholder entered for staging only | Pending sign-off (ops to set real prices; no market research was done) |
| P-04 | Customer platform fee | 0% at launch (commission comes from the worker side) | Pending sign-off |
| P-05 | Low rating threshold for quality review | Score of 2 or below | Pending sign-off |
| P-06 | Minimum worker rating for search | None for new workers; 3.5 after 5 ratings | Pending sign-off |
| P-07 | Payout hold for new workers | First payout after 2 completed bookings | Pending sign-off |
| P-08 | Brand name | "Saathi" is a working name; no logo designed | Pending sign-off |

## 4. Legal, tax and compliance items (section 9)

None of these are legal conclusions. Each is built as configuration or as a capability, and needs confirmation from counsel or a chartered accountant.

| ID | Item | What is built | Status |
|---|---|---|---|
| L-01 | Digital Personal Data Protection Act, 2023 and its Rules: purpose-specific consent, notice, access and deletion requests, breach handling, retention limits | Consent records with version; audit log; retention schedule draft in [security-privacy-and-safety.md](security-privacy-and-safety.md); access and deletion request flow planned for Milestone 3 | Needs legal/CA confirmation |
| L-02 | Aadhaar handling: never store full number; use licensed KYC or DigiLocker with explicit consent | Only masked number and provider reference stored; manual dev adapter until vendor chosen | Needs legal/CA confirmation |
| L-03 | GST on platform commission and fees; GST-compliant invoices | Tax rules are config lines; default GST 18% on commission deducted from worker earnings, 0 platform fee | Needs legal/CA confirmation |
| L-04 | Whether GST applies to the customer-facing service price for each category, and who is liable (worker, platform as e-commerce operator, or neither) | Config supports customer-side tax lines; none applied by default | Needs legal/CA confirmation |
| L-05 | TDS obligations on worker payouts (for example as an e-commerce operator) | `tds_payable` ledger account and config rate, default 0 | Needs legal/CA confirmation |
| L-06 | Gig and platform worker obligations under the labour codes (for example aggregator registration and welfare contributions) | Not built; ledger can add a contribution line | Needs legal/CA confirmation |
| L-07 | Consumer protection: clear pricing before payment, cancellation and refund terms, grievance officer contact | Price breakdown before payment; policy shown at checkout; grievance officer placeholder in footer | Needs legal/CA confirmation |
| L-08 | Code of conduct, terms of service and privacy notice text | Versioned acceptance stored; draft text needed from counsel | Needs legal/CA confirmation |
| L-09 | Police verification process and lawful basis for background checks | Document type and admin review exist; provider choice open | Needs legal/CA confirmation |
| L-10 | PSARA licensing (security guards, Tier C) and licences for other Tier C categories | Engine supports extra required documents per service; categories not enabled | Needs legal/CA confirmation |

## 5. Vendors and launch blockers

| ID | Item | Current state | Status |
|---|---|---|---|
| V-01 | Payment gateway category approval: confirm in writing that the business model and each launch category (personal driver, event staff, errands) and later the companion category are approved merchant categories | Request to prepare in Milestone 0; sandbox gateway in use; live payments blocked in code unless `PAYMENTS_MODE=live` and the approval flag is set | **Launch blocker** |
| V-02 | Payment gateway vendor (Razorpay primary, Cashfree secondary) | Adapter interface and sandbox implementation | Open: vendor |
| V-03 | SMS / OTP vendor (needs DLT sender ID and templates in India) | Dev-log adapter; fixed code only for listed test phones outside production | Open: vendor |
| V-04 | KYC vendor or DigiLocker partner | Manual review adapter | Open: vendor |
| V-05 | Police verification provider | Manual upload and review | Open: vendor |
| V-06 | Masked calling vendor | Not started (Milestone 3) | Open: vendor |
| V-07 | Payout provider | Not started (Milestone 3) | Open: vendor |
| V-08 | Error monitoring (Sentry proposed) and uptime monitoring | Structured logs only | Open: vendor |
| V-09 | Transactional email | Dev-log adapter | Open: vendor |
| V-10 | Domain | `SITE_URL` environment variable; relative URLs elsewhere | Open |
| V-11 | Supabase and Vercel access for staging | Supabase staging project `pitzttrxmzpprzbomvpj` set up on 28 Oct 2026: migrations 0000 to 0006 applied, restricted `saathi_app` user via the transaction pooler, Data API access revoked, private `worker-documents` bucket, staging seed loaded. Region is Tokyo (ap-northeast-1), accepted for testing only; each database round trip from India is about 200 ms. Vercel not connected yet | Open: production project must be created in Mumbai (ap-south-1); rotate the staging secret key and database password before any real data |

## 6. Decisions made while building Milestone 1

| ID | Decision | Status | Reason and notes |
|---|---|---|---|
| T-16 | The admin and operations dashboard is English only and does not go through the i18n catalogue | Decided | Internal staff tool. All customer and worker strings go through `t()`. Service error codes map to catalogue messages through `errorText()`. |
| T-17 | Login OTP uses one numeric input with one-time-code autofill rather than six separate boxes | Decided | Simpler and more robust for paste, SMS autofill and screen readers. Deviation from design-system.md 6.4; revisit after usability testing. |
| T-18 | The site header is sticky but does not condense on scroll | Decided | Avoids a scroll listener on every page. Deviation from design-system.md 6.1; low priority. |
| T-19 | Booking chat updates when a message is sent or the page reloads; no live push yet | Decided | Real-time updates (polling or a push channel) come with the communication vendor decision in Milestone 3. |
| T-20 | Booking start and end codes are stored twice: an HMAC hash for checking and an AES-256-GCM copy that only the customer's view decrypts | Decided | The customer must be able to see their codes; the worker must never receive them from the API. |
| T-21 | Police certificates without a printed expiry are treated as valid for 12 months from issue | Pending sign-off | Config in `src/modules/workers/service.ts`; move to `config_values` in Milestone 3. |
| T-22 | Staging and local pages are always noindex, even when supply is live | Decided | Prevents a staging host from being indexed. Production applies the section 13 rule. |
| T-23 | Home page treats every service equally: the main call to action is "Book a person" and leads to the services section, not the driver page | Decided (owner request, 28 Oct 2026) | Saathi is multi-category; availability per service is shown on each card. |
| T-24 | "What you can book" is a grid of photo cards (two fanned photos per service) instead of text rows | Decided (owner request, 28 Oct 2026) | Built on the existing design system (tokens, 2px radius) rather than adding shadcn/ui, which would bring a second styling system. Hover motion only on pointer devices and only when reduced motion is off. |
| T-25 | Service photos are free Unsplash Licence images, hotlinked and resized by next/image | Decided | Credits in docs/image-credits.md. Replace with commissioned photography before launch marketing. |
| T-26 | "Something else" requests are stored in an `enquiries` table and listed for ops; prohibited services are refused, ambiguous wording is marked for review | Decided | A first slice of assisted matching (Milestone 2) and CRM leads (M15). Status changes, owners, deadlines and quotes come in Milestone 2. |
| T-27 | Elder care, domestic help and medical support at home are added as Tier C services: configured with their extra documents and checks, shown on the site as "Coming later" with a waitlist, never bookable and never indexed | Decided (owner request, 28 Oct 2026); enabling is Pending sign-off | Brief section 4 puts in-home domestic help and nursing or medical care in Tier C, and section 20 requires asking before enabling Tier C. `isOfferable()` refuses Tier C regardless of city status or flags, so turning them on needs a deliberate code and config change after L-11 to L-13 are confirmed. Prices are not set (shown as ₹0 in the admin catalogue, hidden on the site). |

## 7. Legal items added for Tier C (none of these are legal conclusions)

| ID | Item | What is built | Status |
|---|---|---|---|
| L-11 | Domestic help: whether state rules for agencies that place domestic workers (for example in Delhi) or domestic worker welfare schemes apply to Saathi, and what registration or contracts they need | Service configured, not bookable; police verification and customer ID required | Needs legal/CA confirmation |
| L-12 | Medical support at home: how to verify registration with a State Nursing Council, whether home nursing needs registration under health establishment rules, liability and insurance, and what tasks nurses may do at home | Requires `nursing_registration` and `medical_qualification` documents; copy says "not for emergencies, call 112" | Needs legal/CA confirmation |
| L-13 | Elder care at home: scope limits for non-medical caregivers, training standards to accept, consent when the person cared for is not the customer, and safeguarding duties | Requires `caregiver_training` and `first_aid_certificate`; copy says non-medical | Needs legal/CA confirmation |
