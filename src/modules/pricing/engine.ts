import type { CancellationPolicy, PricingConfig } from '../catalog/config';

/**
 * Pricing engine (M08). Pure functions, integer paise only, BigInt intermediates so
 * multiplication by basis points can never lose precision. Rounding is half up per line.
 *
 * The same snapshot drives three things, which is how "price shown = snapshot = ledger" holds:
 *  - the breakdown shown before payment (`customer.lines`)
 *  - the booking's stored `price_snapshot`
 *  - the completion journal (`allocations`)
 */

export interface PriceLine {
  code: string;
  label: string;
  amountPaise: number;
}

export type AllocationAccount =
  | 'worker_payable'
  | 'commission_revenue'
  | 'platform_fee_revenue'
  | 'gst_output_payable'
  | 'tds_payable';

export interface PriceSnapshot {
  schemaVersion: 1;
  currency: 'INR';
  serviceSlug: string;
  citySlug: string;
  pricingVersion: number;
  pricing: PricingConfig;
  durationMinutes: number;
  customer: { lines: PriceLine[]; totalPaise: number };
  worker: { grossPaise: number; deductions: PriceLine[]; netPaise: number };
  allocations: { account: AllocationAccount; amountPaise: number }[];
}

export function applyBps(amountPaise: number, bps: number): number {
  assertPaise(amountPaise);
  if (!Number.isInteger(bps) || bps < 0) throw new Error(`invalid bps ${bps}`);
  return Number((BigInt(amountPaise) * BigInt(bps) + 5000n) / 10000n);
}

function assertPaise(n: number) {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`invalid paise amount ${n}`);
}

export function serviceAmount(pricing: PricingConfig, durationMinutes: number): number {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) throw new Error('duration must be positive minutes');
  switch (pricing.model) {
    case 'hourly': {
      if (pricing.hourlyRatePaise == null) throw new Error('hourly pricing needs hourlyRatePaise');
      return Number((BigInt(pricing.hourlyRatePaise) * BigInt(durationMinutes) + 30n) / 60n);
    }
    case 'daily': {
      if (pricing.dailyRatePaise == null) throw new Error('daily pricing needs dailyRatePaise');
      return pricing.dailyRatePaise * Math.ceil(durationMinutes / (24 * 60));
    }
    case 'fixed': {
      if (pricing.fixedPaise == null) throw new Error('fixed pricing needs fixedPaise');
      return pricing.fixedPaise;
    }
  }
}

export function computePrice(input: {
  pricing: PricingConfig;
  pricingVersion: number;
  durationMinutes: number;
  serviceSlug: string;
  citySlug: string;
  serviceLabel: string;
}): PriceSnapshot {
  const { pricing } = input;
  const service = serviceAmount(pricing, input.durationMinutes);
  const platformFee = applyBps(service, pricing.platformFee.bps) + pricing.platformFee.flatPaise;
  const commission = applyBps(service, pricing.commissionBps);

  const base = { service, commission, platform_fee: platformFee } as const;
  const customerTaxes: PriceLine[] = [];
  const workerTaxes: PriceLine[] = [];
  for (const rule of pricing.taxes) {
    const amount = applyBps(base[rule.base], rule.rateBps);
    if (amount === 0) continue;
    const line = { code: rule.code, label: rule.label, amountPaise: amount };
    (rule.payer === 'customer' ? customerTaxes : workerTaxes).push(line);
  }
  const tds = applyBps(service, pricing.tdsBps);

  const hours = input.durationMinutes / 60;
  const customerLines: PriceLine[] = [
    {
      code: 'service',
      label: `${input.serviceLabel}, ${Number.isInteger(hours) ? hours : hours.toFixed(1)} hours`,
      amountPaise: service,
    },
  ];
  if (platformFee > 0) customerLines.push({ code: 'platform_fee', label: 'Booking fee', amountPaise: platformFee });
  customerLines.push(...customerTaxes);
  const customerTotal = customerLines.reduce((s, l) => s + l.amountPaise, 0);

  const deductions: PriceLine[] = [{ code: 'commission', label: 'Platform commission', amountPaise: commission }];
  deductions.push(...workerTaxes);
  if (tds > 0) deductions.push({ code: 'tds', label: 'TDS', amountPaise: tds });
  const workerNet = service - deductions.reduce((s, l) => s + l.amountPaise, 0);
  if (workerNet < 0) throw new Error('pricing config produces a negative worker earning');

  const gst = [...customerTaxes, ...workerTaxes].reduce((s, l) => s + l.amountPaise, 0);
  const allocations: PriceSnapshot['allocations'] = (
    [
      { account: 'worker_payable', amountPaise: workerNet },
      { account: 'commission_revenue', amountPaise: commission },
      { account: 'platform_fee_revenue', amountPaise: platformFee },
      { account: 'gst_output_payable', amountPaise: gst },
      { account: 'tds_payable', amountPaise: tds },
    ] as const
  ).filter((a) => a.amountPaise > 0);

  const allocated = allocations.reduce((s, a) => s + a.amountPaise, 0);
  if (allocated !== customerTotal) {
    // Invariant: every rupee the customer pays is allocated exactly once.
    throw new Error(`allocation mismatch: ${allocated} != ${customerTotal}`);
  }

  return {
    schemaVersion: 1,
    currency: 'INR',
    serviceSlug: input.serviceSlug,
    citySlug: input.citySlug,
    pricingVersion: input.pricingVersion,
    pricing,
    durationMinutes: input.durationMinutes,
    customer: { lines: customerLines, totalPaise: customerTotal },
    worker: { grossPaise: service, deductions, netPaise: workerNet },
    allocations,
  };
}

/** Cancellation fee per policy, as a share of the customer total. */
export function cancellationFee(policy: CancellationPolicy, totalPaise: number, hoursBeforeStart: number) {
  if (hoursBeforeStart > policy.freeBeforeHours) return { feePaise: 0, band: 'free' as const };
  if (hoursBeforeStart > policy.veryLateBeforeHours)
    return { feePaise: applyBps(totalPaise, policy.lateFeeBps), band: 'late' as const };
  return { feePaise: applyBps(totalPaise, policy.veryLateFeeBps), band: 'very_late' as const };
}

export const formatInr = (paise: number) => {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rupees);
};
