import { en, type Messages } from './en';

/**
 * Minimal typed i18n (decisions.md T-08). English ships now; Hindi ("hi") is added as another
 * catalogue with the same shape, and the locale comes from the route when Hindi pages launch.
 * Interpolation: "Hello {name}". Customer and worker strings must go through t().
 */
export const LOCALES = ['en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const HTML_LANG: Record<Locale, string> = { en: 'en-IN' };

const catalogues: Record<Locale, Messages> = { en };

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Paths<T> = T extends string ? never : { [K in keyof T]: K extends string ? (T[K] extends string ? K : Join<K, Paths<T[K]>>) : never }[keyof T];
export type MessageKey = Paths<Messages>;

function lookup(obj: unknown, key: string): string | undefined {
  let cur: unknown = obj;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in cur) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function t(key: MessageKey, vars?: Record<string, string | number>, locale: Locale = DEFAULT_LOCALE): string {
  const raw = lookup(catalogues[locale], key) ?? lookup(catalogues[DEFAULT_LOCALE], key) ?? key;
  return interpolate(raw, vars);
}

/** Maps a service error code to a catalogue message, falling back to the service's English message. */
export function errorText(code: string | undefined, fallback: string, locale: Locale = DEFAULT_LOCALE): string {
  if (!code) return fallback;
  return lookup(catalogues[locale], `errors.${code}`) ?? fallback;
}

export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
