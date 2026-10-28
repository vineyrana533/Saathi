/**
 * Applies migrations to the database in DATABASE_URL_OWNER (staging/production).
 * If SAATHI_APP_PASSWORD is set, it also gives the restricted saathi_app role that login
 * password (an operator step; the password lives only in environment settings).
 *   pnpm tsx --env-file=.env.staging.local scripts/migrate.ts
 */
import postgres from 'postgres';
import { runMigrations } from './lib/migrate';

const ownerUrl = process.env.DATABASE_URL_OWNER;
if (!ownerUrl) {
  console.error('DATABASE_URL_OWNER is required');
  process.exit(1);
}
const local = /@localhost[:/]/.test(ownerUrl);

/** True if the app connection string already logs in, so the password needs no reset. */
async function appLoginWorks(appUrl: string | undefined) {
  if (!appUrl) return false;
  const sql = postgres(appUrl, { max: 1, prepare: false, onnotice: () => {}, connect_timeout: 10 });
  try {
    await sql`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await sql.end();
  }
}

async function main() {
  await runMigrations({ ownerUrl: ownerUrl!, appUrl: process.env.DATABASE_URL, setAppPassword: local });
  const appPassword = process.env.SAATHI_APP_PASSWORD;
  // Re-setting an unchanged password makes the Supabase pooler refuse new app logins for a few
  // seconds, which the live site would feel, so only set it when the current one fails.
  if (!local && appPassword && !(await appLoginWorks(process.env.DATABASE_URL))) {
    if (!/^[A-Za-z0-9_-]{20,}$/.test(appPassword)) throw new Error('SAATHI_APP_PASSWORD must be 20+ chars of [A-Za-z0-9_-]');
    const sql = postgres(ownerUrl!, { max: 1, onnotice: () => {} });
    try {
      await sql.unsafe(`ALTER ROLE saathi_app LOGIN PASSWORD '${appPassword}'`);
    } finally {
      await sql.end();
    }
    console.log('saathi_app login password set');
  }
  console.log('Migrations applied');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
