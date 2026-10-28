import { describe, expect, it } from 'vitest';
import { hasStagingAccess, isGateExempt } from '@/platform/staging-gate';

const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`;

describe('staging password gate', () => {
  it('accepts the right password with any username', () => {
    expect(hasStagingAccess(basic('saathi', 'right-pass'), 'right-pass')).toBe(true);
    expect(hasStagingAccess(basic('anyone', 'right-pass'), 'right-pass')).toBe(true);
  });
  it('rejects wrong, missing or malformed credentials', () => {
    expect(hasStagingAccess(basic('saathi', 'wrong'), 'right-pass')).toBe(false);
    expect(hasStagingAccess(null, 'right-pass')).toBe(false);
    expect(hasStagingAccess('Bearer abc', 'right-pass')).toBe(false);
    expect(hasStagingAccess('Basic !!!not-base64', 'right-pass')).toBe(false);
    expect(hasStagingAccess(`Basic ${btoa('no-colon')}`, 'right-pass')).toBe(false);
  });
  it('lets cron, webhooks and the health check through, and nothing else', () => {
    expect(isGateExempt('/api/cron/run')).toBe(true);
    expect(isGateExempt('/api/webhooks/payments/sandbox')).toBe(true);
    expect(isGateExempt('/api/health')).toBe(true);
    expect(isGateExempt('/admin')).toBe(false);
    expect(isGateExempt('/api/v1/bookings')).toBe(false);
  });
});
