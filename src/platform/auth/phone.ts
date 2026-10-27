import { invalid } from '../errors';

/**
 * Normalises Indian mobile numbers to E.164 (+91XXXXXXXXXX).
 * Accepts spaces, dashes, a leading 0, 91 or +91. Rejects anything that is not a 10-digit mobile starting 6-9.
 */
export function normaliseIndianMobile(input: string): string {
  const digits = input.replace(/[\s\-().]/g, '');
  let local = digits;
  if (local.startsWith('+91')) local = local.slice(3);
  else if (local.startsWith('0091')) local = local.slice(4);
  else if (local.length === 12 && local.startsWith('91')) local = local.slice(2);
  else if (local.length === 11 && local.startsWith('0')) local = local.slice(1);
  if (!/^[6-9]\d{9}$/.test(local)) {
    throw invalid('invalid_phone', 'Enter a 10-digit Indian mobile number');
  }
  return `+91${local}`;
}

export const maskPhone = (e164: string) => `${e164.slice(0, 3)} ${'•'.repeat(6)}${e164.slice(-4)}`;
