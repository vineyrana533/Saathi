import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../env';
import { decrypt, encrypt, sha256Hex } from '../crypto';

/**
 * Identity and verification documents. Always encrypted app-side with AES-256-GCM before
 * they reach any storage backend. Local filesystem now; Supabase Storage once access is granted.
 */
export interface DocumentStore {
  readonly name: string;
  put(content: Buffer): Promise<{ key: string; sha256: string }>;
  get(key: string): Promise<Buffer>;
}

const localEncrypted: DocumentStore = {
  name: 'local-encrypted',
  async put(content) {
    const key = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.bin`;
    const full = resolveKey(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, encrypt(content));
    return { key, sha256: sha256Hex(content) };
  },
  async get(key) {
    return decrypt(await fs.readFile(resolveKey(key)));
  },
};

const KEY_PATTERN = /^\d{4}-\d{2}\/[0-9a-f-]{36}\.bin$/;

function resolveKey(key: string) {
  if (!KEY_PATTERN.test(key)) throw new Error('invalid storage key');
  return path.resolve(env().LOCAL_DOCUMENT_DIR, key);
}

/**
 * Supabase Storage, private bucket. Files are AES-256-GCM encrypted before upload, so the bucket
 * only ever holds ciphertext. Uses the server-only secret key; never called from the browser.
 */
const supabaseEncrypted: DocumentStore = {
  name: 'supabase',
  async put(content) {
    const key = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.bin`;
    const res = await fetch(objectUrl(key), {
      method: 'POST',
      headers: { ...supabaseHeaders(), 'Content-Type': 'application/octet-stream', 'x-upsert': 'false' },
      body: new Uint8Array(encrypt(content)),
    });
    if (!res.ok) throw new Error(`document upload failed (${res.status})`);
    return { key, sha256: sha256Hex(content) };
  },
  async get(key) {
    const res = await fetch(objectUrl(key), { headers: supabaseHeaders() });
    if (!res.ok) throw new Error(`document download failed (${res.status})`);
    return decrypt(Buffer.from(await res.arrayBuffer()));
  },
};

function supabaseHeaders() {
  const { SUPABASE_SECRET_KEY } = env();
  if (!SUPABASE_SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY is not set');
  return { apikey: SUPABASE_SECRET_KEY, Authorization: `Bearer ${SUPABASE_SECRET_KEY}` };
}

function objectUrl(key: string) {
  const { SUPABASE_URL, SUPABASE_DOCUMENTS_BUCKET } = env();
  if (!SUPABASE_URL) throw new Error('SUPABASE_URL is not set');
  if (!KEY_PATTERN.test(key)) throw new Error('invalid storage key');
  return `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${SUPABASE_DOCUMENTS_BUCKET}/${key}`;
}

export function documentStore(): DocumentStore {
  switch (env().DOCUMENT_STORE) {
    case 'local-encrypted':
      return localEncrypted;
    case 'supabase':
      return supabaseEncrypted;
  }
}

export const ALLOWED_UPLOAD_TYPES: Record<string, Buffer[]> = {
  'image/jpeg': [Buffer.from([0xff, 0xd8, 0xff])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4e, 0x47])],
  'application/pdf': [Buffer.from('%PDF')],
};
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Checks magic bytes so the declared type cannot be spoofed by the client. */
export function sniffType(buf: Buffer): string | null {
  for (const [type, sigs] of Object.entries(ALLOWED_UPLOAD_TYPES)) {
    if (sigs.some((s) => buf.subarray(0, s.length).equals(s))) return type;
  }
  return null;
}
