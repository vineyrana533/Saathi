import { t } from '@/i18n';
import { getMyWorkerProfile, LANGUAGES } from '@/modules/workers/service';
import { listAllZones, listCities } from '@/modules/geo/service';
import { listLocalityOptions } from '@/modules/geo/location';
import { LocationPicker } from '@/ui/location-picker';

const RADII = [3, 5, 10, 15, 20, 25, 30, 40, 50];
import { ActionForm, SubmitButton } from '@/ui/action-form';
import { Field, Input, PageHeading, Select, Textarea } from '@/ui/primitives';
import { requireSession } from '../../_lib/session';
import { saveProfileAction } from '../actions';

export default async function WorkerProfilePage() {
  const { ctx } = await requireSession('/worker/profile');
  const [mine, cities, zones, homeOptions] = await Promise.all([getMyWorkerProfile(ctx), listCities(), listAllZones(), listLocalityOptions()]);
  const p = mine?.profile;
  const homeCity = cities.find((c) => c.id === p?.homeCityId)?.slug ?? 'delhi';
  return (
    <>
      <PageHeading title={t('worker.profileTitle')} />
      <ActionForm action={saveProfileAction} errorTitle={t('common.errorTitle')}>
        <Field id="f-displayName" label={t('worker.displayName')}>
          <Input id="f-displayName" name="displayName" required maxLength={40} defaultValue={p?.displayName ?? ''} />
        </Field>
        <Field id="f-bio" label={t('worker.bio')} help={t('worker.bioHelp')} optional={t('common.optional')}>
          <Textarea id="f-bio" name="bio" maxLength={600} defaultValue={p?.bio ?? ''} />
        </Field>
        <fieldset id="f-languages">
          <legend className="text-small font-semibold">{t('worker.languages')}</legend>
          <div className="mt-2 grid grid-cols-2 gap-x-4 sm:grid-cols-3">
            {LANGUAGES.map((l) => (
              <label key={l} className="flex min-h-11 items-center gap-2">
                <input type="checkbox" name="languages" value={l} defaultChecked={p ? p.languages.includes(l) : l === 'Hindi'} className="size-5 accent-ink" />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="f-gender" label={t('worker.gender')}>
            <Select id="f-gender" name="gender" defaultValue={p?.gender ?? ''}>
              <option value="">{t('account.genderNone')}</option>
              <option value="female">{t('account.genderFemale')}</option>
              <option value="male">{t('account.genderMale')}</option>
              <option value="non_binary">{t('account.genderNonBinary')}</option>
            </Select>
          </Field>
          <Field id="f-yearsExperience" label={t('worker.years')}>
            <Input id="f-yearsExperience" name="yearsExperience" type="number" min={0} max={50} inputMode="numeric" defaultValue={p?.yearsExperience ?? 0} />
          </Field>
        </div>
        <Field id="f-homeCitySlug" label={t('worker.homeCity')}>
          <Select id="f-homeCitySlug" name="homeCitySlug" defaultValue={homeCity}>
            {cities.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <LocationPicker
          id="f-baseLocalityId"
          name="baseLocalityId"
          latName="baseLat"
          lngName="baseLng"
          label={t('location.homeArea')}
          help={t('location.homeHelp')}
          options={homeOptions}
          defaultValue={p?.baseLocalityId ?? null}
          precision={2}
          labels={{ useMine: t('location.useMine'), locating: t('location.locating'), using: t('location.using'), denied: t('location.denied'), outside: t('location.homeOutside') }}
        />
        <Field id="f-travelRadiusKm" label={t('location.radius')}>
          <Select id="f-travelRadiusKm" name="travelRadiusKm" defaultValue={String(p?.travelRadiusKm ?? 10)} className="max-w-56">
            {RADII.map((km) => (
              <option key={km} value={km}>
                {t('location.radiusOption', { km })}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset id="f-zoneIds">
          <legend className="text-small font-semibold">{t('worker.zones')}</legend>
          {cities.map((c) => (
            <div key={c.id} className="mt-3">
              <p className="eyebrow">{c.name}</p>
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                {zones
                  .filter((z) => z.cityId === c.id)
                  .map((z) => (
                    <label key={z.id} className="flex min-h-11 items-center gap-2">
                      <input type="checkbox" name="zoneIds" value={z.id} defaultChecked={mine?.zoneIds.includes(z.id)} className="size-5 accent-ink" />
                      {z.name}
                    </label>
                  ))}
              </div>
            </div>
          ))}
        </fieldset>
        <Field id="f-customerGenderPreference" label={t('worker.customerPref')}>
          <Select id="f-customerGenderPreference" name="customerGenderPreference" defaultValue={p?.customerGenderPreference ?? 'any'}>
            <option value="any">{t('worker.prefAny')}</option>
            <option value="female">{t('worker.prefFemale')}</option>
            <option value="male">{t('worker.prefMale')}</option>
          </Select>
        </Field>
        <div>
          <SubmitButton>{t('worker.save')}</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
