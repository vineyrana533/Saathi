/**
 * Local PostgreSQL 17 for development (docs/system-architecture.md section 2).
 *   pnpm db:local start   init if needed, start on port 54329, create db, migrate
 *   pnpm db:local stop
 *   pnpm db:local status
 *   pnpm db:local reset   stop, delete .local/pgdata, start fresh
 */
import fs from 'node:fs';
import path from 'node:path';
import { clusterRunning, initCluster, startCluster, stopCluster } from './lib/pg-cluster';
import { ensureDatabase, runMigrations } from './lib/migrate';

const DATA = path.resolve('.local/pgdata');
const PORT = 54329;
const OWNER_PW = 'postgres';
const SERVER = `postgres://postgres:${OWNER_PW}@localhost:${PORT}`;
const APP_URL = process.env.DATABASE_URL ?? `postgres://saathi_app:saathi_app_local@localhost:${PORT}/saathi`;

async function start() {
  if (await initCluster(DATA, OWNER_PW)) console.log('Initialised cluster in .local/pgdata');
  if (!(await clusterRunning(DATA))) {
    await startCluster(DATA, PORT);
    console.log(`Postgres 17 running on localhost:${PORT}`);
  } else console.log('Postgres already running');
  await ensureDatabase(`${SERVER}/postgres`, 'saathi');
  await runMigrations({ ownerUrl: `${SERVER}/saathi`, appUrl: APP_URL, setAppPassword: true });
  console.log('Migrations applied. App connects as saathi_app (RLS enforced).');
}

async function main() {
  const cmd = process.argv[2] ?? 'start';
  if (cmd === 'start') await start();
  else if (cmd === 'stop') {
    if (await clusterRunning(DATA)) await stopCluster(DATA);
    console.log('Stopped');
  } else if (cmd === 'status') console.log((await clusterRunning(DATA)) ? 'running' : 'stopped');
  else if (cmd === 'reset') {
    if (fs.existsSync(DATA) && (await clusterRunning(DATA))) await stopCluster(DATA);
    fs.rmSync(DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    await start();
  } else throw new Error(`unknown command ${cmd}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
