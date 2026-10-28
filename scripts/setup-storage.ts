/**
 * Creates the private document bucket on Supabase Storage if it is missing, then checks the
 * adapter end to end (encrypted upload, download, decrypt, delete).
 *   pnpm tsx --env-file=.env.staging.local scripts/setup-storage.ts
 */
import { randomBytes } from 'node:crypto';
import { env } from '../src/platform/env';
import { documentStore } from '../src/platform/adapters/storage';

async function main() {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_DOCUMENTS_BUCKET } = env();
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required');
  const base = `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1`;
  const headers = { apikey: SUPABASE_SECRET_KEY, Authorization: `Bearer ${SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' };

  const existing = await fetch(`${base}/bucket/${SUPABASE_DOCUMENTS_BUCKET}`, { headers });
  if (existing.status === 200) {
    const b = (await existing.json()) as { public: boolean };
    if (b.public) throw new Error(`Bucket ${SUPABASE_DOCUMENTS_BUCKET} is PUBLIC. Make it private before storing documents.`);
    console.log(`Bucket ${SUPABASE_DOCUMENTS_BUCKET} exists and is private.`);
  } else {
    const created = await fetch(`${base}/bucket`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: SUPABASE_DOCUMENTS_BUCKET, name: SUPABASE_DOCUMENTS_BUCKET, public: false, file_size_limit: 6 * 1024 * 1024 }),
    });
    if (!created.ok) throw new Error(`could not create bucket (${created.status}): ${await created.text()}`);
    console.log(`Created private bucket ${SUPABASE_DOCUMENTS_BUCKET}.`);
  }

  if (env().DOCUMENT_STORE !== 'supabase') {
    console.log('DOCUMENT_STORE is not "supabase"; skipping the round-trip check.');
    return;
  }
  const sample = randomBytes(2048);
  const store = documentStore();
  const { key } = await store.put(sample);
  const back = await store.get(key);
  if (!back.equals(sample)) throw new Error('round trip mismatch');
  const raw = await fetch(`${base}/object/${SUPABASE_DOCUMENTS_BUCKET}/${key}`, { headers });
  const stored = Buffer.from(await raw.arrayBuffer());
  if (stored.includes(sample.subarray(0, 64))) throw new Error('stored object is not encrypted');
  const anon = await fetch(`${base}/object/public/${SUPABASE_DOCUMENTS_BUCKET}/${key}`);
  if (anon.ok) throw new Error('object is publicly readable');
  await fetch(`${base}/object/${SUPABASE_DOCUMENTS_BUCKET}`, { method: 'DELETE', headers, body: JSON.stringify({ prefixes: [key] }) });
  console.log('Round trip OK: uploaded encrypted, read back and decrypted, not publicly readable, test file deleted.');
}

main().catch((e) => {
  console.error(e instanceof Error ? `${e.message}${e.cause ? ` (cause: ${String((e.cause as Error).message ?? e.cause)})` : ""}` : e);
  process.exit(1);
});
