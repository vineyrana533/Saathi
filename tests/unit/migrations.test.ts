import { describe, expect, it } from 'vitest';
import postgres from 'postgres';

describe('migrations and database roles', () => {
  it('app role is not owner and cannot bypass RLS', async () => {
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
      const [me] = await sql`select current_user as u, rolbypassrls as bypass from pg_roles where rolname = current_user`;
      expect(me?.u).toBe('saathi_app');
      expect(me?.bypass).toBe(false);
      const owners = await sql`select count(*)::int as n from pg_tables where schemaname = 'public' and tableowner = current_user`;
      expect(owners[0]?.n).toBe(0);
      const noRls = await sql`
        select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
          and c.relname <> '__drizzle_migrations'`;
      expect(noRls.map((r) => r.relname)).toEqual([]);
      // Helper functions are callable by the app role only, not by PUBLIC (0006_supabase_lockdown.sql).
      const [fn] = await sql`
        select has_function_privilege('saathi_app', 'app_worker_id()', 'execute') as app,
               exists (select 1 from information_schema.role_routine_grants where routine_name = 'app_worker_id' and grantee = 'PUBLIC') as public_grant`;
      expect(fn).toMatchObject({ app: true, public_grant: false });
    } finally {
      await sql.end();
    }
  });
});
