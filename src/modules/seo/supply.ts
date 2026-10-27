import type { Tx } from '@/platform/db/client';
import { asSystem, type Ctx } from '@/platform/db/client';
import { isOfferable, type ServiceInCity } from '../catalog/service';
import { countVerifiedSupply } from '../workers/eligibility';
import { todayIst } from '@/platform/time';

/**
 * Section 17: a city-service goes live only with enough verified, active supply.
 * Live = offerable (status, tier, flag) AND supply >= threshold. Below threshold the page is
 * noindex, shows a waitlist, and booking is refused.
 */
export interface SupplyStatus {
  offerable: boolean;
  verifiedWorkers: number;
  threshold: number;
  live: boolean;
}

export async function supplyStatus(tx: Tx, ctx: Ctx, s: ServiceInCity): Promise<SupplyStatus> {
  const verifiedWorkers = await asSystem(tx, ctx, () =>
    countVerifiedSupply(tx, { serviceId: s.service.id, config: s.service.config, cityId: s.city.id, onDate: todayIst() }),
  );
  const offerable = isOfferable(s);
  const threshold = s.serviceCity.goLiveMinWorkers;
  return { offerable, verifiedWorkers, threshold, live: offerable && verifiedWorkers >= threshold };
}
