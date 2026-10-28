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
| P-10 | First response to assisted requests | 2 business hours, business hours 09:00 to 19:00 IST, Monday to Saturday (config `request.first_response_minutes`, `business_hours`) | Pending sign-off |
| P-09 | Hourly prices for the other services, Delhi, Noida, Gurugram | Event staff ₹300, errands ₹200, elder care ₹200, domestic help ₹150, medical support ₹350 per hour; placeholders entered for staging only | Pending sign-off (ops to set real prices in the admin catalogue; no market research was done) |

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
| V-11 | Supabase and Vercel access for staging | Done 28 Oct 2026. Supabase staging project `pitzttrxmzpprzbomvpj` (Tokyo): migrations 0000 to 0007, restricted `saathi_app` user via the pooler, Data API access revoked, private `worker-documents` bucket, staging seed. Vercel project `saathi` (vineyrana533-1319, Hobby): functions in Tokyo, auto-deploy from GitHub `main`, behind the staging password, live at https://saathi-three-chi.vercel.app and verified with a full booking | Open for production: Mumbai Supabase and Vercel projects, paid plans, fresh secrets. Rotate the staging Supabase key, database password and Vercel token, which were shared in chat |

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
| T-27 | Elder care, domestic help and medical support at home are added as Tier C services: configured with their extra documents and checks, shown on the site as "Coming later" with a waitlist, never bookable and never indexed | Superseded by T-31 on 28 Oct 2026 | Brief section 4 puts in-home domestic help and nursing or medical care in Tier C, and section 20 requires asking before enabling Tier C. `isOfferable()` refuses Tier C regardless of city status or flags, so turning them on needs a deliberate code and config change after L-11 to L-13 are confirmed. Prices are not set (shown as ₹0 in the admin catalogue, hidden on the site). |

## 7. Legal items added for Tier C (none of these are legal conclusions)

| ID | Item | What is built | Status |
|---|---|---|---|
| L-11 | Domestic help: whether state rules for agencies that place domestic workers (for example in Delhi) or domestic worker welfare schemes apply to Saathi, and what registration or contracts they need | Bookable since T-31; police verification and a verified customer ID required | Needs legal/CA confirmation. **Launch blocker** for real customers of this service |
| L-12 | Medical support at home: how to verify registration with a State Nursing Council, whether home nursing needs registration under health establishment rules, liability and insurance, and what tasks nurses may do at home | Bookable since T-31; requires `nursing_registration` and `medical_qualification` documents; copy says "not for emergencies, call 112" | Needs legal/CA confirmation. **Launch blocker** for real customers of this service |
| L-13 | Elder care at home: scope limits for non-medical caregivers, training standards to accept, consent when the person cared for is not the customer, and safeguarding duties | Bookable since T-31; requires `caregiver_training` and `first_aid_certificate`; copy says non-medical | Needs legal/CA confirmation. **Launch blocker** for real customers of this service |

## 8. Staging hosting decisions (28 Oct 2026)

| ID | Decision | Status | Reason and notes |
|---|---|---|---|
| T-28 | The cron runs once a day (02:30 UTC, 08:00 IST) | Decided for Hobby plan | Vercel Hobby only allows daily cron jobs. Nothing depends on the cron for correctness: stale payment holds are cleared inside the booking transaction, and eligibility checks document expiry dates directly. Switch to every minute (`* * * * *`) on Vercel Pro, before real SMS notifications go out. |
| T-29 | Function region is set per Vercel project, not in `vercel.json` | Decided | Staging functions run in Tokyo (`hnd1`), next to the staging database. Production must use Mumbai (`bom1`) with a Mumbai Supabase project. Each page makes several database round trips, so functions must sit next to the database. |
| T-30 | The staging site is behind a shared password (HTTP Basic auth) when `STAGING_ACCESS_PASSWORD` is set | Decided | Staging test accounts use a known login code, including an admin account. Cron, payment webhooks and the health check are exempt because they carry their own secrets. Never set this variable in production. |

## 9. Every service bookable online (28 Oct 2026)

| ID | Decision | Status | Reason and notes |
|---|---|---|---|
| T-31 | Every service is bookable online in Delhi, Noida and Gurugram: personal driver, event staff, errands, elder care, domestic help and medical support. Mumbai stays on the waitlist. Social companion (Tier B) stays off | Decided by the owner on 28 Oct 2026, after being told the brief (section 20) asks to hold Tier C back and that L-11 to L-13 are open | Migration 0008 and the seed apply it. Each Tier C service keeps its feature flag (`category.elder-care`, `category.domestic-help`, `category.medical-support`) as the off switch: with the flag off its page falls back to the waitlist and booking is refused. Each service still goes live in a city only with 10 verified workers there (P-01). L-11 to L-13 and gateway category approval for these services (V-01) must be settled before real customers book them. |
| T-32 | Customers book in-home services (any service with `customerVerification: 'id'`) only after a verifier approves an ID they upload in their account | Decided | New `customer_id_checks` table with row-level security: customers see and add only their own, verifiers and admins review, no deletes. Files are encrypted like worker documents and every view is audit logged; only the last 4 characters of the number are stored. Review is by eye until a KYC vendor is chosen (V-04). One check at a time per customer. |
| T-33 | An online booking is for one person. Teams go through a request and quote | Decided; teams built in Milestone 2 (T-36 to T-42) | Direct booking assigns one chosen person. `workersRequired.max` now sets how many people a customer may ask for in a request: event staff 50, personal driver 10, errands 5, domestic help 3, elder care and medical support 1. |
| T-34 | Workers can apply for any open service from their documents page. Each service asks for its own extra documents once applied for | Decided | Tier A services need status active; Tier B and C also need their flag on. Nursing registration asks for the last 4 characters and the renewal date; training, first aid and qualification certificates ask for the issue date. |
| T-35 | The staging seed adds 12 sample workers per service across Delhi NCR, and gives the test customer (+91 90000 00002) a verified ID | Decided for staging and local only | So every Delhi NCR page passes the go-live threshold for testing. Names say "Sample", bios say "Not a real person", documents say "Seed sample, no file", and the seed refuses to run in production. |

## 10. Milestone 2: assisted requests, quotes and team bookings (28 Oct 2026)

| ID | Decision | Status | Reason and notes |
|---|---|---|---|
| T-36 | Requests are taken for any active service in a live city, even when the service has fewer than 10 verified people there | Decided | Section 17 says pages below the threshold stay unbookable online; assisted requests are how demand is met before supply is dense. Tier B and C still need their flag, and Tier B and C still need a verified customer ID. |
| T-37 | A request must start at least 24 hours ahead (B-03 assisted lead time) or the service's own notice period, whichever is longer | Decided | Gives ops time to find people. |
| T-38 | A quote is valid for 48 hours (B-08) but never later than one hour before the job starts; a sent quote cannot be edited, only withdrawn and replaced by a new version | Decided | Enforced by a database trigger as well as the service. Accepted, declined, expired and withdrawn quotes are immutable. |
| T-39 | "Accept" means "accept and pay". The quote and request become accepted only when the payment is captured; an unpaid hold that lapses leaves the quote open until it expires | Decided | Avoids accepted quotes with no booking behind them. A second click while the payment window is open returns the same booking. |
| T-40 | A team booking pays for `workers_needed` places. Proposed people who are still free are assigned when the customer accepts; anyone no longer free leaves an empty place. Ops fill empty places from the booking page, and the job cannot start until every place is filled | Decided | Partial fill shows on the overview, in the bookings list filter "Places still to fill" and to the customer ("2 of 3 people confirmed"). The exclusion constraint still stops anyone being on two overlapping jobs. Reducing a team after payment needs partial refunds (Milestone 3). |
| T-41 | Team prices are worked out for one person and multiplied, so each person's earning is exact. The completion journal pays every assigned person the same net amount | Decided | Price shown = snapshot = ledger still holds by construction and by test. |
| T-42 | On a team booking, a worker who cancels frees only their own place; the booking stays on for the customer | Decided | Ops see the empty place. The customer can still cancel the whole booking under the normal policy. Each person is rated separately. |
| T-43 | Start and end codes stay one per booking. Any person on the team can enter them | Decided for Milestone 2 | Per-person check-in belongs with safety check-ins (Milestone 3). |
| T-44 | Workers do not see requests or accept job offers yet. Ops confirm people by phone before proposing them | Decided for Milestone 2 | Job offers with accept or decline are Milestone 3 (M10). |
