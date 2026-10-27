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

function resolveKey(key: string) {
  if (!/^\d{4}-\d{2}\/[0-9a-f-]{36}\.bin$/.test(key)) throw new Error('invalid storage key');
  return path.resolve(env().LOCAL_DOCUMENT_DIR, key);
}

export function documentStore(): DocumentStore {
  switch (env().DOCUMENT_STORE) {
    case 'local-encrypted':
      return localEncrypted;
    case 'supabase':
      throw new Error('Supabase Storage adapter is pending project access (decisions.md V-11)');
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
