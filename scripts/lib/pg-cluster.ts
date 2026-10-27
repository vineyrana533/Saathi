/**
 * Drives real PostgreSQL 17 binaries from the @embedded-postgres platform packages.
 * We call initdb and pg_ctl ourselves: on Windows, pg_ctl drops administrator rights,
 * which Postgres requires; launching postgres directly fails for admin users.
 * All child processes use stdio 'ignore' so the long-lived server never holds our pipes.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

async function binaries(): Promise<{ initdb: string; pgCtl: string }> {
  const pkg =
    process.platform === 'win32'
      ? '@embedded-postgres/windows-x64'
      : process.platform === 'linux'
        ? '@embedded-postgres/linux-x64'
        : null;
  if (!pkg) throw new Error(`No embedded Postgres binaries configured for ${process.platform}`);
  const mod = (await import(pkg)) as { pg_ctl: string; initdb: string };
  return { initdb: mod.initdb, pgCtl: mod.pg_ctl };
}

function run(cmd: string, args: string[], what: string, logFile?: string) {
  const res = spawnSync(cmd, args, { stdio: 'ignore', windowsHide: true, timeout: 120_000 });
  if (res.status !== 0) {
    const tail = logFile && fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').slice(-2000) : '';
    throw new Error(`${what} failed (exit ${res.status ?? res.signal}). ${tail}`);
  }
}

export async function initCluster(dataDir: string, password: string) {
  if (fs.existsSync(path.join(dataDir, 'PG_VERSION'))) return false;
  fs.mkdirSync(dataDir, { recursive: true });
  const pwFile = path.join(os.tmpdir(), `saathi-pw-${process.pid}-${Date.now()}`);
  fs.writeFileSync(pwFile, password);
  try {
    const { initdb } = await binaries();
    run(
      initdb,
      ['-D', dataDir, '-U', 'postgres', `--pwfile=${pwFile}`, '-A', 'scram-sha-256', '-E', 'UTF8', '--locale=C'],
      'initdb',
    );
  } finally {
    fs.rmSync(pwFile, { force: true });
  }
  return true;
}

export async function startCluster(dataDir: string, port: number) {
  const { pgCtl } = await binaries();
  const logFile = path.join(dataDir, 'server.log');
  run(
    pgCtl,
    ['-D', dataDir, '-o', `-p ${port} -c listen_addresses=localhost -c max_connections=100`, '-l', logFile, '-w', '-t', '60', 'start'],
    'pg_ctl start',
    logFile,
  );
}

export async function stopCluster(dataDir: string) {
  const { pgCtl } = await binaries();
  run(pgCtl, ['-D', dataDir, '-m', 'fast', '-w', '-t', '60', 'stop'], 'pg_ctl stop');
}

export async function clusterRunning(dataDir: string): Promise<boolean> {
  const { pgCtl } = await binaries();
  const res = spawnSync(pgCtl, ['-D', dataDir, 'status'], { stdio: 'ignore', windowsHide: true });
  return res.status === 0;
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => (typeof addr === 'object' && addr ? resolve(addr.port) : reject(new Error('no port'))));
    });
  });
}
