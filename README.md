# Saathi

Saathi (working name) is a marketplace for hiring a verified person for a specific job in India, starting with Delhi, Noida and Gurugram, with Mumbai configured for later. Customers pick a time, see only people who are verified and genuinely free, see the full price before paying, and start and end each job with codes only they hold. Workers are approved one service at a time. The service engine is configurable, so new categories are mostly configuration. Personal drivers are the first live category; event staff and errand help are configured but not yet open.

## Status

- **Milestone 0 (foundations)** and **Milestone 1 (personal driver, Delhi NCR, direct booking)** are built and run locally against real PostgreSQL 17.
- Nothing is deployed. Staging needs Supabase and Vercel access (see "Deploying to staging").
- Every external vendor runs in a sandbox or development mode, and the site says so on every page: payments (sandbox gateway, no real money), SMS (written to the server log), KYC (manual review by the verification team), document storage (encrypted local files).
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
| +91 90000 00002 | customer (code of conduct already accepted) |
| +91 90000 00003 | worker: verified driver in three Delhi zones |

The seed also creates twelve drivers named "Sample Driver 01" to "Sample Driver 12" across Delhi NCR, so the Delhi, Noida and Gurugram driver pages pass the go-live threshold locally. They are not real people and have no document files. Any other number gets a random code printed in the server log.

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

## Deploying to staging

None of these steps has been done. They need access to the Supabase and Vercel accounts.

1. Create a Supabase project in `ap-south-1` (Mumbai). Note the direct connection URL (owner) and the transaction pooler URL.
2. Run migrations as the owner:

   ```bash
   DATABASE_URL_OWNER="<direct connection url>" pnpm db:migrate
   ```

3. In the Supabase SQL editor, give the application role a strong password (the migration creates the role without login):

   ```sql
   ALTER ROLE saathi_app LOGIN PASSWORD '<generated password>';
   ```

4. Create the Vercel project with function region `bom1`. Set every variable from `.env.example`: `APP_ENV=staging`, `SITE_URL`, `DATABASE_URL` (pooler URL with the `saathi_app` user), `DATABASE_URL_OWNER` (only where migrations run), and freshly generated `OTP_PEPPER`, `DOCUMENT_ENCRYPTION_KEY` (32 bytes, base64), `SANDBOX_WEBHOOK_SECRET` and `CRON_SECRET`. Keep `PAYMENTS_MODE=sandbox` and `PAYMENTS_LIVE_APPROVED=false`.
5. Document storage: until the Supabase Storage adapter is written, keep `DOCUMENT_STORE=local-encrypted`, which does not persist on Vercel. Uploads will not survive between function runs, so document upload on staging needs the storage adapter first.
6. Add a Vercel Cron job (a `vercel.json` `crons` entry, not in the repo yet) calling `/api/cron/run`. Vercel sends `Authorization: Bearer <CRON_SECRET>`. Per-minute schedules need a paid Vercel plan; check the plan's cron limits. With a slower schedule, stale payment holds are still cleared whenever someone tries to book the same worker.
7. Seed staging with `pnpm db:seed` pointed at the staging database if you want test accounts. Do not seed production.
8. Check `/api/health`, then walk through a booking with the test accounts.
