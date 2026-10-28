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

async function main() {
  await runMigrations({ ownerUrl: ownerUrl!, appUrl: process.env.DATABASE_URL, setAppPassword: local });
  const appPassword = process.env.SAATHI_APP_PASSWORD;
  if (!local && appPassword) {
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
