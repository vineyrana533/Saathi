/**
 * Starts a throwaway PostgreSQL 17 cluster for the test run, applies all migrations,
 * and points the app (role saathi_app, RLS enforced) at it. Removed after the run.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { freePort, initCluster, startCluster, stopCluster } from '../../scripts/lib/pg-cluster';
import { ensureDatabase, runMigrations } from '../../scripts/lib/migrate';

let dataDir: string | undefined;

export default async function setup() {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saathi-test-pg-'));
  const port = await freePort();
  await initCluster(dataDir, 'postgres');
  await startCluster(dataDir, port);

  const server = `postgres://postgres:postgres@localhost:${port}`;
  await ensureDatabase(`${server}/postgres`, 'saathi_test');
  const ownerUrl = `${server}/saathi_test`;
  const appUrl = `postgres://saathi_app:saathi_app_test@localhost:${port}/saathi_test`;
  await runMigrations({ ownerUrl, appUrl, setAppPassword: true });

  process.env.DATABASE_URL = appUrl;
  process.env.DATABASE_URL_OWNER = ownerUrl;
  process.env.APP_ENV = 'test';
  process.env.LOCAL_DOCUMENT_DIR = path.join(dataDir, 'documents');

  return async () => {
    if (dataDir) {
      await stopCluster(dataDir).catch((e) => console.error('stop failed', e));
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    }
  };
}
