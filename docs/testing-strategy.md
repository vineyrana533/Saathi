# Testing strategy

Status: In place for Milestones 0 and 1. Last updated 27 October 2026.

## 1. Principles

- Tests run against **real PostgreSQL 17**, not mocks, because the important guarantees live in the database: row-level security, the no-overlap exclusion constraint, the ledger balance trigger, append-only triggers and the booking status guard.
- The application under test connects as `saathi_app`, the same non-owner role used in production, so RLS applies in every test.
- Acceptance tests call the real services and, where the brief says "even by calling the API directly", the real route handlers.
- No test depends on another test's data.

## 2. Layers

| Layer | Folder | What it covers |
|---|---|---|
| Unit | `tests/unit` | Pricing engine maths and rounding (`pricing.test.ts`), content scanner (`moderation.test.ts`), phone parsing, IST time, slot rules, log redaction, permission matrix, document encryption (`platform.test.ts`), database roles and RLS coverage (`migrations.test.ts`) |
| Integration | `tests/integration` | Phone OTP sign-in through the API routes, attempt counting, rate limits, fixed code only for test phones (`auth.test.ts`); worker sign-up to searchable driver through verifier approval, encrypted storage, audit of file views, upload rejection rules (`worker-onboarding.test.ts`) |
| Acceptance | `tests/acceptance` | The ten Milestone 1 acceptance criteria (section 4) |

## 3. Database harness

- `tests/helpers/global-setup.ts` runs once per `pnpm test`. It creates a temp directory, picks a free port, runs `initdb` and `pg_ctl start` through `scripts/lib/pg-cluster.ts`, creates database `saathi_test`, applies every migration as the owner, and gives `saathi_app` a login password. It then sets `DATABASE_URL` (app role), `DATABASE_URL_OWNER`, `APP_ENV=test` and `LOCAL_DOCUMENT_DIR` for the test workers. Teardown stops the cluster and deletes the folder (with retries, because Windows briefly holds files after Postgres exits).
- Binaries come from the `@embedded-postgres/windows-x64` and `@embedded-postgres/linux-x64` npm packages. `pg_ctl` is used rather than starting `postgres` directly, because on Windows Postgres refuses to run with administrator rights and `pg_ctl` drops them.
- `vitest.config.ts` runs files one at a time (`fileParallelism: false`), with a 30-second test timeout and 120-second hook timeout.

### Isolation through fixtures (`tests/helpers/fixtures.ts`)

- `createTestCity()` creates a fresh city with two zones and its own live personal-driver service-city row, with a chosen go-live threshold. Each test file works in its own city, so worker counts and availability never leak between files.
- `createDriver()` creates a fully verified driver (active, KYC verified, approved licence, police certificate and ID, approved for personal driver, working 06:00 to 23:00 daily) with options to break one condition at a time.
- `createUser()` creates a customer or staff user with the code of conduct accepted unless told otherwise; `createSessionToken()` creates a real session for API calls.
- `ownerSql()` opens an owner connection for test-only time travel, such as moving a booking's start close to now or expiring a document.

## 4. Milestone 1 acceptance criteria mapped to tests

| # | Criterion | File | Tests |
|---|---|---|---|
| 1 | Cannot book an unverified, unapproved, out-of-area or already-booked worker | `m1-eligibility.test.ts` | "rejects an unverified worker (applicant status)"; "rejects a worker not approved for this category"; "rejects a worker outside the service area"; "rejects a worker whose licence does not cover the vehicle class"; "rejects a worker already booked for an overlapping slot, and hides them in search"; plus "shows and books a fully verified, approved, available worker" and "requires the code of conduct before the first booking" |
| 2 | Two customers, same worker and slot, same moment: exactly one succeeds | `m1-concurrency.test.ts` | "lets exactly one of several simultaneous bookings for the same slot succeed" (three rounds of five parallel bookings); "database exclusion constraint rejects an overlapping active assignment directly" |
| 3 | Price shown = snapshot = ledger | `m1-price-integrity.test.ts` | "shown price = stored snapshot = capture journal = completion journal"; "rejects a booking when the client saw a different total" |
| 4 | Changing the price after booking does not change the confirmed booking | `m1-price-snapshot.test.ts` | "keeps the confirmed booking, its snapshot and its ledger at the old price" |
| 5 | Replaying the same webhook creates one payment | `m1-webhook-idempotency.test.ts` | "processes a replayed webhook once (through the HTTP route)"; "does not capture twice when a different event arrives for the same payment"; "rejects a forged signature and stores nothing"; "ignores a captured event whose amount does not match the order" |
| 6 | A job cannot start without the correct customer OTP | `m1-start-otp.test.ts` | "rejects a wrong code and keeps the job confirmed; accepts the right one"; "counts wrong attempts across requests and locks after five"; "does not let the customer or another worker start the job"; "refuses to start far from the booked time"; "needs the end code to complete, and never shows codes to the worker"; "cannot start a booking that has not been paid" |
| 7 | A worker with an expired licence disappears from driver search automatically | `m1-document-expiry.test.ts` | "drops a driver from search the moment the licence expiry date passes"; "hides a driver for dates after the licence expires, but not before"; "the sweep marks the licence expired, suspends the driver approval and notifies the worker" |
| 8 | Chat blocks a phone number typed into a message | `m1-chat-filter.test.ts` | "blocks ... and does not deliver it" for seven phone variants (digits, spaced, dashed, English number words, Hindi number words, single digits, "whatsapp me"); "blocks contact or payment details" for email, UPI ID, link and social handle; "delivers an ordinary message to the other party"; "raises a moderation flag for every blocked message"; "does not let an outsider post into the booking chat" |
| 9 | Workers and customers cannot see each other's bookings, even through the API | `m1-data-isolation.test.ts` | "API: owner and assigned worker can read; other customer, other worker and anonymous cannot"; "API: booking lists and chat only return the caller's own data"; "service: lists are scoped to the caller"; "database: RLS hides other users' bookings, payments and documents even with a raw query" |
| 10 | City-service page in the sitemap within one deploy of going live; noindex below threshold | `m1-seo-sitemap.test.ts` | "is noindex and absent from the sitemap below the threshold, indexable and listed at it"; "does not publish pages for Tier B categories while their flag is off"; "keeps a paused city-service out of the sitemap regardless of supply" |

Last recorded full run: 27 October 2026, 16 test files and 109 tests, all passed. Code changed after that run (user interface work and small service additions), so the suite must be run again before this milestone is marked Verified.

## 5. How to run

```bash
pnpm test
```

```bash
pnpm vitest run tests/acceptance/m1-concurrency.test.ts
```

No database needs to be running; the harness starts its own. The first run on a machine takes about 20 seconds for `initdb`.

## 6. Continuous integration (`.github/workflows/ci.yml`)

On every pull request and every push to `main`, on `ubuntu-latest` with Node 22 and pnpm from `packageManager`:

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm lint` (includes module boundary rules)
4. `pnpm test` (real Postgres 17 from the Linux binary package)
5. `pnpm build` with CI-only placeholder secrets

The workflow has not run yet, because nothing has been pushed to GitHub.

## 7. Manual checks done

On 28 October 2026 the full customer and worker flow was walked through in a browser against a local database: search, sign-in, address blocking, sandbox payment failure then success, start code shown to the customer, chat blocking, wrong and correct start code, end code, earnings page, admin booking view with ledger, Mumbai coming-soon page, phone-width layout and mobile menu keyboard behaviour.

## 8. Gaps

| Gap | Plan |
|---|---|
| No automated browser end-to-end tests | Add Playwright for the booking flow, worker job flow and verification queue in Milestone 2 |
| No automated accessibility checks (axe) in CI | Add axe runs on key pages with Playwright |
| No load or soak tests | Before public launch: search and booking under concurrent load, cron sweeps at volume |
| No Core Web Vitals measurement | Lighthouse CI or field data once staging is deployed |
| No restore drill for backups | Milestone 3 exit criterion |
| Copy lint for banned phrases and em dashes is not automated | Add a script over `src/i18n` |
