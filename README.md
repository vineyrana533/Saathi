# Saathi

Saathi (working name) is a marketplace for hiring a verified person for a specific job in India, starting with Delhi, Noida and Gurugram, with Mumbai configured for later. Customers pick a time, see only people who are verified and genuinely free, see the full price before paying, and start and end each job with codes only they hold. Workers are approved one service at a time. The service engine is configurable, so new categories are mostly configuration. Personal drivers are the first live category; event staff and errand help are configured but not yet open.

## Status

- **Milestone 0 (foundations)** and **Milestone 1 (personal driver, Delhi NCR, direct booking)** are built and run locally against real PostgreSQL 17.
- Staging is live, password protected, at https://saathi-three-chi.vercel.app (see "Staging"). Production is not set up.
- Every external vendor runs in a sandbox or development mode, and the site says so on every page: payments (sandbox gateway, no real money), SMS (written to the server log), KYC (manual review by the verification team), document storage (encrypted, local files on your machine and Supabase Storage on staging).
- Real customers must not use this until the public launch gate in [docs/security-privacy-and-safety.md](docs/security-privacy-and-safety.md) is met and payment gateway approval is recorded ([docs/gateway-approval-request.md](docs/gateway-approval-request.md)).
- Progress per module: [docs/module-status.md](docs/module-status.md).

## Prerequisites

- Node.js 22 or later
- pnpm 10 (the version is pinned in `package.json`)
- No Docker and no system Postgres needed: PostgreSQL 17 binaries come from npm packages for Windows x64 and Linux x64.

## Run it locally

```bash
pnpm install
```

```bash
pnpm db:local start
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

Then open http://localhost:3000. `pnpm db:local start` creates a database cluster in `.local/pgdata`, starts it on port 54329 and applies all migrations. Copy `.env.example` to `.env.local` only if you need to change a default.

### Test accounts (from `scripts/seed.ts`)

Sign in with these numbers and code `123456`. The fixed code works only for numbers listed in `DEV_TEST_PHONES`, and never in production.

| Phone | Roles |
|---|---|
| +91 90000 00001 | admin, ops, verifier, finance |
| +91 90000 00002 | customer (code of conduct accepted, ID already verified so in-home services can be booked) |
| +91 90000 00003 | worker: verified driver in three Delhi zones |

To try a team booking (Milestone 2): as the customer, open any service page in Delhi and choose "Ask for a quote", for example 3 event staff. As the admin, open Operations, then "Requests and quotes": take the request, tick the people to propose, save the draft and send it. As the customer, accept and pay the quote on the request page. Places you did not fill show under Bookings with the filter "Places still to fill", where you assign the rest.

The seed also creates twelve sample workers per service across Delhi NCR ("Sample Driver 01", "Sample Caregiver 01", "Sample Nurse 01" and so on), so every Delhi, Noida and Gurugram service page passes the go-live threshold locally and on staging. They are not real people, have no document files and cannot sign in. Any other number gets a random code printed in the server log.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js development server |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm typecheck` | TypeScript check |
| `pnpm lint` | ESLint, including module boundary rules |
| `pnpm test` | All tests against a throwaway PostgreSQL 17 cluster |
| `pnpm test:watch` | Tests in watch mode |
| `pnpm db:local start` / `stop` / `status` / `reset` | Manage the local database |
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm db:migrate` | Apply migrations to `DATABASE_URL_OWNER` |
| `pnpm db:seed` | Seed reference data and test accounts (refuses in production) |
| `pnpm jobs:run` | Run the scheduled sweeps once |

## Project layout

```
src/app/            Pages, layouts, server actions and route handlers
  (site)/           Customer site and city/service pages
  worker/           Worker portal (mobile-first)
  admin/            Operations dashboard
  api/              REST API (v1), payment webhooks, cron, health
src/modules/        Domain modules: identity, geo, catalog, workers, bookings, pricing,
                    payments (ledger), chat (moderation), reviews, seo, jobs, notifications, ops
src/platform/       Database access with RLS context, auth, adapters, logging, rate limits, config
src/i18n/           Message catalogue (English now, Hindi-ready)
src/ui/             Presentational components
drizzle/            SQL migrations (generated plus hand-written security layer)
scripts/            Local database, migrations, seed, jobs
tests/              Unit, integration and acceptance tests
docs/               Specifications, decisions and tracker
```

## Documentation

- Product: [product-requirements](docs/product-requirements.md), [module-catalog](docs/module-catalog.md), [implementation-roadmap](docs/implementation-roadmap.md), [module-status](docs/module-status.md)
- Architecture: [system-architecture](docs/system-architecture.md), [database-design](docs/database-design.md), [booking-lifecycle](docs/booking-lifecycle.md), [roles-and-permissions](docs/roles-and-permissions.md), [api-contracts](docs/api-contracts.md), [events-and-automation](docs/events-and-automation.md)
- Money: [pricing-and-finance](docs/pricing-and-finance.md), [gateway-approval-request](docs/gateway-approval-request.md)
- Trust: [security-privacy-and-safety](docs/security-privacy-and-safety.md)
- Design: [design-reference-analysis](docs/design-reference-analysis.md), [design-system](docs/design-system.md)
- Quality: [testing-strategy](docs/testing-strategy.md), [seo-plan](docs/seo-plan.md)
- Decisions and open questions: [decisions](docs/decisions.md)

## Staging

Staging is live at **https://saathi-three-chi.vercel.app** (Vercel project `saathi` under vineyrana533-1319, Hobby plan). It is behind a shared password: any username, password in `STAGING_ACCESS_PASSWORD` in `.env.staging.local`. Search engines are blocked.

| Piece | Where | Notes |
|---|---|---|
| App | Vercel, functions in Tokyo (`hnd1`) | Deploys automatically on every push to `main` |
| Database | Supabase `pitzttrxmzpprzbomvpj`, Tokyo | Reached through the pooler (IPv4). App uses the restricted `saathi_app` user |
| Documents | Supabase Storage, private bucket `worker-documents` | Encrypted by the app before upload |
| Cron | Vercel Cron, daily | Hobby plan limit; see decisions T-28 |

All staging settings live in `.env.staging.local` on the operator's machine (git-ignored). Operator commands:

```bash
pnpm tsx --env-file=.env.staging.local scripts/migrate.ts        # apply new migrations to staging
pnpm tsx --env-file=.env.staging.local scripts/seed.ts           # reference data, test accounts, sample workers
pnpm tsx --env-file=.env.staging.local scripts/setup-storage.ts  # create and check the documents bucket
node scripts/vercel-staging.mjs env                              # copy runtime settings to Vercel
node scripts/vercel-staging.mjs deploy                           # redeploy from GitHub main
```

Run migrations **before** pushing code that needs them, because a push deploys immediately.

### Production (not set up)

Production needs its own Supabase project in **Mumbai (ap-south-1)**, a Vercel project with functions in Mumbai (`bom1`), paid plans, fresh secrets, no `STAGING_ACCESS_PASSWORD`, no seed data, and the launch gate in [docs/security-privacy-and-safety.md](docs/security-privacy-and-safety.md).

