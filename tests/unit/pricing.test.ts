import { describe, expect, it } from 'vitest';
import { applyBps, cancellationFee, computePrice, formatInr, serviceAmount } from '@/modules/pricing/engine';
import { DRIVER_PRICING } from '@/modules/catalog/seed';
import type { PricingConfig } from '@/modules/catalog/config';

const base = { pricingVersion: 1, serviceSlug: 'personal-driver', citySlug: 'delhi', serviceLabel: 'Personal driver' };

describe('pricing engine', () => {
  it('rounds basis points half up with integer maths', () => {
    expect(applyBps(10000, 1800)).toBe(1800);
    expect(applyBps(3, 5000)).toBe(2); // 1.5 rounds up
    expect(applyBps(1, 4999)).toBe(0);
    expect(applyBps(9_000_000_000_000, 2000)).toBe(1_800_000_000_000);
    expect(() => applyBps(1.5, 100)).toThrow();
    expect(() => applyBps(-1, 100)).toThrow();
  });

  it('prices hourly bookings by the minute', () => {
    expect(serviceAmount(DRIVER_PRICING, 240)).toBe(100000);
    expect(serviceAmount(DRIVER_PRICING, 90)).toBe(37500);
    expect(serviceAmount({ ...DRIVER_PRICING, hourlyRatePaise: 33333 }, 60)).toBe(33333);
  });

  it('allocates every paisa of the customer total exactly once', () => {
    for (const minutes of [240, 300, 420, 720]) {
      for (const rate of [19999, 25000, 33333]) {
        const snap = computePrice({ ...base, pricing: { ...DRIVER_PRICING, hourlyRatePaise: rate }, durationMinutes: minutes });
        const allocated = snap.allocations.reduce((s, a) => s + a.amountPaise, 0);
        expect(allocated).toBe(snap.customer.totalPaise);
        expect(snap.worker.netPaise).toBe(snap.allocations.find((a) => a.account === 'worker_payable')!.amountPaise);
      }
    }
  });

  it('applies 20% commission and 18% GST on commission to the worker side by default', () => {
    const snap = computePrice({ ...base, pricing: DRIVER_PRICING, durationMinutes: 240 });
    expect(snap.customer.totalPaise).toBe(100000);
    expect(snap.worker.deductions).toEqual([
      { code: 'commission', label: 'Platform commission', amountPaise: 20000 },
      { code: 'GST_ON_COMMISSION', label: 'GST on commission (18%)', amountPaise: 3600 },
    ]);
    expect(snap.worker.netPaise).toBe(76400);
  });

  it('adds customer-side fees and taxes to the total when configured', () => {
    const pricing: PricingConfig = {
      ...DRIVER_PRICING,
      platformFee: { bps: 500, flatPaise: 1000 },
      taxes: [...DRIVER_PRICING.taxes, { code: 'GST_FEE', label: 'GST on booking fee', base: 'platform_fee', rateBps: 1800, payer: 'customer' }],
    };
    const snap = computePrice({ ...base, pricing, durationMinutes: 240 });
    // service 100000 + fee (5000 + 1000) + GST on fee 1080
    expect(snap.customer.totalPaise).toBe(107080);
    expect(snap.allocations.reduce((s, a) => s + a.amountPaise, 0)).toBe(107080);
  });

  it('computes cancellation fees by band', () => {
    const policy = { freeBeforeHours: 24, lateFeeBps: 5000, veryLateBeforeHours: 2, veryLateFeeBps: 10000 };
    expect(cancellationFee(policy, 100000, 30)).toEqual({ feePaise: 0, band: 'free' });
    expect(cancellationFee(policy, 100000, 24)).toEqual({ feePaise: 50000, band: 'late' });
    expect(cancellationFee(policy, 100000, 3)).toEqual({ feePaise: 50000, band: 'late' });
    expect(cancellationFee(policy, 100000, 2)).toEqual({ feePaise: 100000, band: 'very_late' });
    expect(cancellationFee(policy, 100000, -1)).toEqual({ feePaise: 100000, band: 'very_late' });
  });

  it('formats rupees for display', () => {
    expect(formatInr(100000)).toBe('₹1,000');
    expect(formatInr(12345)).toBe('₹123.45');
  });
});
