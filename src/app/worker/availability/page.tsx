import { redirect } from 'next/navigation';
import { t, WEEKDAY_KEYS } from '@/i18n';
import { getMyWorkerProfile } from '@/modules/workers/service';
import { minutesToHhmm } from '@/platform/time';
import { ActionForm, SubmitButton } from '@/ui/action-form';
import { Input, PageHeading } from '@/ui/primitives';
import { requireSession } from '../../_lib/session';
import { saveHoursAction } from '../actions';

export default async function AvailabilityPage() {
  const { ctx } = await requireSession('/worker/availability');
  const mine = await getMyWorkerProfile(ctx);
  if (!mine) redirect('/worker/profile');
  return (
    <>
      <PageHeading title={t('worker.hoursTitle')} lede={t('worker.hoursLede')} />
      <ActionForm action={saveHoursAction} errorTitle={t('common.errorTitle')}>
        <ul className="border-t border-ink">
          {WEEKDAY_KEYS.map((k, d) => {
            const row = mine.hours.find((h) => h.weekday === d);
            return (
              <li key={k} className="grid grid-cols-2 items-end gap-3 border-b border-rule py-4 sm:grid-cols-4">
                <p className="col-span-2 font-semibold sm:col-span-1">{t(`weekdays.${k}`)}</p>
                <label className="flex flex-col gap-1 text-small font-semibold">
                  {t('worker.from')}
                  <Input name={`from-${d}`} type="time" step={1800} defaultValue={minutesToHhmm(row?.startMinute ?? 480)} />
                </label>
                <label className="flex flex-col gap-1 text-small font-semibold">
                  {t('worker.to')}
                  <Input name={`to-${d}`} type="time" step={1800} defaultValue={minutesToHhmm(row?.endMinute === 1440 ? 0 : (row?.endMinute ?? 1260))} />
                </label>
                <label className="col-span-2 flex min-h-11 items-center gap-2 sm:col-span-1">
                  <input type="checkbox" name={`off-${d}`} defaultChecked={mine.hours.length > 0 && !row} className="size-5 accent-ink" />
                  {t('worker.off')}
                </label>
              </li>
            );
          })}
        </ul>
        <div>
          <SubmitButton>{t('worker.saveHours')}</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
