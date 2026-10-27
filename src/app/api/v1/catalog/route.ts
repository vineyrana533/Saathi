import { api } from '@/platform/http';
import { listServiceCityPairs } from '@/modules/catalog/service';
import { listAllZones } from '@/modules/geo/service';

/** Public catalogue: services by city with status, and zones. Prices are shown per hour. */
export const GET = api(async () => {
  const [pairs, zones] = await Promise.all([listServiceCityPairs(), listAllZones()]);
  return {
    services: pairs
      .filter((p) => p.riskTier !== 'C' && p.serviceStatus === 'active')
      .map((p) => ({
        service: p.serviceSlug,
        name: p.serviceName,
        summary: p.serviceSummary,
        city: p.citySlug,
        cityName: p.cityName,
        status: p.status,
        hourlyRatePaise: (p.pricing as { hourlyRatePaise?: number }).hourlyRatePaise ?? null,
      })),
    zones,
  };
});
