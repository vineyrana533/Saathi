import { describe, expect, it } from 'vitest';
import { en } from '@/i18n/en';

/** Copy rules from master prompt section 6, enforced on the whole English catalogue. */
const BANNED = [
  "in today's fast-paced world",
  'look no further',
  'embark on a journey',
  'unlock',
  'elevate',
  'seamless',
  'delve',
  'hidden gem',
  'nestled',
  'game-changer',
  'plethora',
  'boasts',
  'vibrant',
  'when it comes to',
  "it's important to note",
  'in conclusion',
  'therapy session',
  'wellness',
];

function strings(obj: unknown, path = ''): [string, string][] {
  if (typeof obj === 'string') return [[path, obj]];
  if (obj && typeof obj === 'object') return Object.entries(obj).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  return [];
}

describe('customer-facing copy', () => {
  const all = strings(en);

  it('has no em dashes', () => {
    expect(all.filter(([, s]) => s.includes('—')).map(([p]) => p)).toEqual([]);
  });

  it('uses none of the banned phrases', () => {
    const hits = all.flatMap(([p, s]) => BANNED.filter((b) => s.toLowerCase().includes(b)).map((b) => `${p}: ${b}`));
    expect(hits).toEqual([]);
  });

  it('says "our team", never "agents"', () => {
    expect(all.filter(([, s]) => /\bagents?\b/i.test(s)).map(([p]) => p)).toEqual([]);
  });

  it('uses at most one exclamation mark per page section', () => {
    const bySection = new Map<string, number>();
    for (const [p, s] of all) bySection.set(p.split('.')[0]!, (bySection.get(p.split('.')[0]!) ?? 0) + (s.match(/!/g)?.length ?? 0));
    expect([...bySection.entries()].filter(([, n]) => n > 1)).toEqual([]);
  });
});
