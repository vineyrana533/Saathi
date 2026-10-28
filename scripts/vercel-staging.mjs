/**
 * Configures the staging Vercel project through the Vercel REST API, reading everything from
 * .env.staging.local (git-ignored). Prints no secret values.
 *   node scripts/vercel-staging.mjs region   -> function region Tokyo (next to the staging database)
 *   node scripts/vercel-staging.mjs env      -> runtime settings (secrets stored as "sensitive")
 *   node scripts/vercel-staging.mjs deploy   -> production deployment from GitHub main
 *   node scripts/vercel-staging.mjs status   -> state of the last deployment started here
 * Needs VERCEL_TOKEN, VERCEL_PROJECT_ID and VERCEL_TEAM_ID in the file. Owner database
 * credentials are never sent to Vercel; they are only for migrations.
 */
import fs from 'node:fs';

const FILE = '.env.staging.local';
const env = Object.fromEntries(
  fs.readFileSync(FILE, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
for (const k of ['VERCEL_TOKEN', 'VERCEL_PROJECT_ID', 'VERCEL_TEAM_ID']) if (!env[k]) throw new Error(`${k} is missing in ${FILE}`);

const SECRET = ['SUPABASE_SECRET_KEY', 'DATABASE_URL', 'OTP_PEPPER', 'DOCUMENT_ENCRYPTION_KEY', 'SANDBOX_WEBHOOK_SECRET', 'CRON_SECRET', 'STAGING_ACCESS_PASSWORD'];
const PLAIN = ['APP_ENV', 'SITE_URL', 'SUPABASE_URL', 'DATABASE_POOL_MAX', 'PAYMENTS_MODE', 'PAYMENTS_LIVE_APPROVED', 'SMS_PROVIDER', 'DOCUMENT_STORE'];

async function api(method, path, body) {
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch(`https://api.vercel.com${path}${sep}teamId=${env.VERCEL_TEAM_ID}`, {
    method,
    headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${j.error?.code ?? ''} ${j.error?.message ?? ''}`);
  return j;
}

const project = env.VERCEL_PROJECT_ID;
switch (process.argv[2]) {
  case 'region': {
    const p = await api('PATCH', `/v9/projects/${project}`, { serverlessFunctionRegion: 'hnd1' });
    console.log('function region:', p.serverlessFunctionRegion);
    break;
  }
  case 'env': {
    for (const key of [...PLAIN, ...SECRET]) {
      if (!env[key]) throw new Error(`${key} is missing in ${FILE}`);
      await api('POST', `/v10/projects/${project}/env?upsert=true`, {
        key,
        value: env[key],
        type: SECRET.includes(key) ? 'sensitive' : 'plain',
        target: ['production', 'preview'],
      });
      console.log(`set ${key}${SECRET.includes(key) ? ' (sensitive)' : ''}`);
    }
    break;
  }
  case 'deploy': {
    const d = await api('POST', '/v13/deployments?forceNew=1', {
      name: 'saathi',
      project,
      target: 'production',
      gitSource: { type: 'github', org: 'vineyrana533', repo: 'Saathi', ref: 'main' },
    });
    fs.mkdirSync('.local', { recursive: true });
    fs.writeFileSync('.local/last-deploy.txt', d.id);
    console.log('deployment started:', d.url);
    break;
  }
  case 'status': {
    const id = fs.readFileSync('.local/last-deploy.txt', 'utf8').trim();
    const d = await api('GET', `/v13/deployments/${id}`);
    console.log(d.readyState, d.url, (d.regions || []).join(','));
    break;
  }
  default:
    console.log('usage: node scripts/vercel-staging.mjs region|env|deploy|status');
}
