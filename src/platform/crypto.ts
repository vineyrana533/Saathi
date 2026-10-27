import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { env } from './env';

export const sha256Hex = (input: string | Buffer) => createHash('sha256').update(input).digest('hex');

export const hmacHex = (secret: string, input: string) => createHmac('sha256', secret).update(input).digest('hex');

/** Hash an OTP or short code with the server pepper and a context (phone, booking id) so hashes are not reusable. */
export const hashCode = (context: string, code: string) => hmacHex(env().OTP_PEPPER, `${context}:${code}`);

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

/** Uniform random numeric code of `digits` length from the CSPRNG. */
export const numericCode = (digits: number) => String(randomInt(0, 10 ** digits)).padStart(digits, '0');

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

function key(): Buffer {
  return Buffer.from(env().DOCUMENT_ENCRYPTION_KEY, 'base64');
}

/** AES-256-GCM. Output layout: 12-byte IV | 16-byte auth tag | ciphertext. */
export function encrypt(plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

export function decrypt(blob: Buffer): Buffer {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]);
}

/** Human-friendly booking reference without ambiguous characters. */
export function bookingRef(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'SA-';
  for (let i = 0; i < 7; i++) out += alphabet[randomInt(0, alphabet.length)];
  return out;
}
