/**
 * Structured JSON logger with personal-data redaction.
 * Keys in REDACT_KEYS are replaced; emails and long digit runs inside strings are masked.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const REDACT_KEYS = new Set([
  'phone',
  'phone_e164',
  'phoneE164',
  'otp',
  'code',
  'token',
  'password',
  'secret',
  'authorization',
  'cookie',
  'address',
  'addressLine',
  'address_line',
  'body',
  'documentNumber',
  'number',
  'idNumber',
  'aadhaar',
  'email',
]);

export function redactString(s: string): string {
  return s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]').replace(/\+?\d[\d\s-]{8,}\d/g, '[number]');
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth]';
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redactString(value.message) };
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = REDACT_KEYS.has(k) ? '[redacted]' : redact(v, depth + 1);
    return out;
  }
  return value;
}

function threshold(): number {
  const lvl = (process.env.LOG_LEVEL as Level) || 'info';
  return ORDER[lvl] ?? ORDER.info;
}

function write(level: Level, msg: string, data?: Record<string, unknown>) {
  if (ORDER[level] < threshold()) return;
  if (process.env.NODE_ENV === 'test' && level !== 'error' && !process.env.LOG_IN_TESTS) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(data ? (redact(data) as object) : {}) });
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, data?: Record<string, unknown>) => write('debug', msg, data),
  info: (msg: string, data?: Record<string, unknown>) => write('info', msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => write('warn', msg, data),
  error: (msg: string, data?: Record<string, unknown>) => write('error', msg, data),
};
