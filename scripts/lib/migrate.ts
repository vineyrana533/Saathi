import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'node:path';

/**
 * Applies migrations as the owner role. In local and test environments it also gives the
 * saathi_app role a login password taken from DATABASE_URL. In staging and production the
 * password is set once by an operator (docs/system-architecture.md section 7).
 */
export async function runMigrations(opts: { ownerUrl: string; appUrl?: string; setAppPassword: boolean }) {
  const client = postgres(opts.ownerUrl, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: path.resolve(process.cwd(), 'drizzle') });
    if (opts.setAppPassword && opts.appUrl) {
      const appPassword = decodeURIComponent(new URL(opts.appUrl).password);
      if (!/^[A-Za-z0-9_\-]+$/.test(appPassword)) throw new Error('app password must be [A-Za-z0-9_-]');
      await client.unsafe(`ALTER ROLE saathi_app LOGIN PASSWORD '${appPassword}'`);
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

export async function ensureDatabase(serverOwnerUrl: string, dbName: string) {
  if (!/^[a-z_][a-z0-9_]*$/.test(dbName)) throw new Error('invalid database name');
  const client = postgres(serverOwnerUrl, { max: 1, onnotice: () => {} });
  try {
    const rows = await client`select 1 from pg_database where datname = ${dbName}`;
    if (rows.length === 0) await client.unsafe(`CREATE DATABASE ${dbName}`);
  } finally {
    await client.end({ timeout: 5 });
  }
}
