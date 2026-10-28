import { listServiceCityPairs } from '@/modules/catalog/service';
import { getCityServicePage } from '@/modules/seo/service';
import { pricingConfigSchema } from '@/modules/catalog/config';
import { formatInr } from '@/modules/pricing/engine';
import { can } from '@/platform/auth/permissions';
import { ActionForm, SubmitButton } from '@/ui/action-form';
import { Input, Notice, Pill, Select, STATUS_TONE } from '@/ui/primitives';
import { requireAnyRole, STAFF } from '../../_lib/session';
import { setStatusAction, updatePriceAction } from '../actions';

export default async function CatalogPage() {
  const { ctx } = await requireAnyRole(STAFF, '/admin/catalog');
  const pairs = await listServiceCityPairs();
  const rows = await Promise.all(
    pairs.map(async (p) => ({ p, page: await getCityServicePage(p.citySlug, p.serviceSlug), pricing: pricingConfigSchema.parse(p.pricing) })),
  );
  const editable = can(ctx, 'catalog.manage');
  return (
    <>
      <h1 className="font-display text-h1 font-bold">Services and prices</h1>
      <Notice tone="warning" title="Placeholder prices">
        Hourly prices are staging placeholders pending internal sign-off (decisions.md P-03). A price change applies to new bookings only; confirmed bookings keep their snapshot.
      </Notice>
      <ul className="mt-8 border-t border-ink">
        {rows.map(({ p, page, pricing }) => (
          <li key={p.serviceCityId} className="grid gap-4 border-b border-rule py-6 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <p className="font-display text-h4 font-semibold">
                {p.serviceName}, {p.cityName}
              </p>
              <p className="mt-1 flex flex-wrap gap-2 text-small">
                <Pill tone={p.riskTier === 'A' ? 'trust' : 'danger'}>Tier {p.riskTier}</Pill>
                <Pill tone={STATUS_TONE[p.status] ?? 'neutral'}>{p.status}</Pill>
                {page ? (
                  <Pill tone={page.supply.live ? 'success' : 'warning'}>
                    {page.supply.verifiedWorkers} of {page.supply.threshold} verified workers · {page.indexable ? 'indexable' : 'noindex'}
                  </Pill>
                ) : (
                  <Pill tone="neutral">Not public (flag off)</Pill>
                )}
              </p>
              <p className="mt-2 text-small text-ink-2">
                {formatInr(pricing.hourlyRatePaise ?? 0)}/hour · commission {pricing.commissionBps / 100}% · pricing version {p.pricingVersion}
              </p>
            </div>
            {editable && p.riskTier === 'A' ? (
              <div className="flex flex-wrap items-start gap-6 lg:col-span-8">
                <ActionForm action={updatePriceAction} errorTitle="Could not update price">
                  <input type="hidden" name="serviceCityId" value={p.serviceCityId} />
                  <input type="hidden" name="current" value={JSON.stringify(pricing)} />
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1 text-small font-semibold" htmlFor={`f-hourlyRupees-${p.serviceCityId}`}>
                      ₹ per hour
                      <Input id={`f-hourlyRupees-${p.serviceCityId}`} name="hourlyRupees" type="number" min={1} step="1" defaultValue={(pricing.hourlyRatePaise ?? 0) / 100} className="w-32" />
                    </label>
                    <label className="flex flex-col gap-1 text-small font-semibold">
                      Commission %
                      <Input name="commissionPct" type="number" min={0} max={60} step="0.5" defaultValue={pricing.commissionBps / 100} className="w-28" />
                    </label>
                    <SubmitButton variant="secondary">Save price</SubmitButton>
                  </div>
                </ActionForm>
                <ActionForm action={setStatusAction} errorTitle="Could not update status">
                  <input type="hidden" name="serviceCityId" value={p.serviceCityId} />
                  <div className="flex items-end gap-3">
                    <label className="flex flex-col gap-1 text-small font-semibold">
                      City status
                      <Select name="status" defaultValue={p.status} className="w-40">
                        <option value="live">Live</option>
                        <option value="waitlist">Waitlist</option>
                        <option value="paused">Paused</option>
                      </Select>
                    </label>
                    <SubmitButton variant="secondary">Save</SubmitButton>
                  </div>
                </ActionForm>
              </div>
            ) : (
              <p className="text-small text-ink-2 lg:col-span-8">{p.riskTier === 'B'
                  ? 'Gated category. Enabling needs the Milestone 6 safety review and sign-off.'
                  : p.riskTier === 'C'
                    ? 'Tier C: needs licensed or specially checked workers. Enabling needs legal review, a priced offer and internal sign-off (decisions.md T-27).'
                    : 'Admin role needed to edit.'}</p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
