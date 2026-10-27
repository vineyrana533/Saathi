import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import * as schema from './schema';
import { env } from '../env';
import type { Role } from '../../modules/identity/schema';

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Request context. Every database access goes through withDb(ctx), which sets
 * app.user_id and app.roles for row-level security. There is no other way to get a handle.
 */
export interface Ctx {
  userId: string | null;
  roles: readonly (Role | 'system')[];
  requestId: string;
}

export const anonymousCtx = (requestId: string = randomUUID()): Ctx => ({ userId: null, roles: [], requestId });

/** Only for verified webhooks, cron jobs, auth internals and seeds. */
export const systemCtx = (requestId: string = randomUUID()): Ctx => ({ userId: null, roles: ['system'], requestId });

const globalForDb = globalThis as unknown as { __saathiSql?: postgres.Sql; __saathiDb?: Db };

function getDb(): Db {
  if (!globalForDb.__saathiDb) {
    const client = postgres(env().DATABASE_URL, {
      max: env().DATABASE_POOL_MAX,
      prepare: false, // required for the Supabase transaction pooler
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
      connection: { application_name: 'saathi' },
    });
    globalForDb.__saathiSql = client;
    globalForDb.__saathiDb = drizzle(client, { schema });
  }
  return globalForDb.__saathiDb;
}

export async function closeDb() {
  await globalForDb.__saathiSql?.end({ timeout: 5 });
  globalForDb.__saathiSql = undefined;
  globalForDb.__saathiDb = undefined;
}

async function setContext(tx: Tx, userId: string | null, roles: readonly string[]) {
  await tx.execute(
    sql`select set_config('app.user_id', ${userId ?? ''}, true), set_config('app.roles', ${roles.join(',')}, true)`,
  );
}

export async function withDb<T>(ctx: Ctx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await setContext(tx, ctx.userId, ctx.roles);
    return fn(tx);
  });
}

/**
 * Narrow escalation inside an existing transaction, for internal steps that must see rows the
 * caller cannot (stale holds of other customers, availability of all workers, ledger posting).
 * Callers must have already authorised the operation. Restores the caller's context afterwards.
 */
export async function asSystem<T>(tx: Tx, ctx: Ctx, fn: () => Promise<T>): Promise<T> {
  await setContext(tx, ctx.userId, [...ctx.roles.filter((r) => r !== 'system'), 'system']);
  try {
    return await fn();
  } finally {
    await setContext(tx, ctx.userId, ctx.roles).catch(() => {
      /* transaction already aborted; the original error propagates */
    });
  }
}

/** Postgres error helpers. */
export function pgCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

export const PG_UNIQUE_VIOLATION = '23505';
export const PG_EXCLUSION_VIOLATION = '23P01';
export const PG_CHECK_VIOLATION = '23514';
