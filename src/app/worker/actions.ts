'use server';

import { revalidatePath } from 'next/cache';
import { applyForService, saveWorkerProfile, setWeeklyHours, uploadDocument } from '@/modules/workers/service';
import { runAction, str } from '../_lib/actions';
import { pageSession } from '../_lib/session';
import { t } from '@/i18n';
import type { ActionState } from '@/ui/action-form';
import { invalid } from '@/platform/errors';

export async function saveProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    await saveWorkerProfile(ctx, {
      displayName: str(fd, 'displayName'),
      bio: str(fd, 'bio'),
      languages: fd.getAll('languages').map(String) as never,
      gender: (str(fd, 'gender') || null) as never,
      yearsExperience: Number(str(fd, 'yearsExperience') || 0),
      homeCitySlug: str(fd, 'homeCitySlug'),
      zoneIds: fd.getAll('zoneIds').map(String),
      customerGenderPreference: (str(fd, 'customerGenderPreference') || 'any') as never,
    });
    return t('worker.saved');
  });
  revalidatePath('/worker', 'layout');
  return state;
}

export async function uploadDocumentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    const file = fd.get('file');
    if (!(file instanceof File) || file.size === 0) throw invalid('empty_file', 'Choose a file to upload', { field: 'file' });
    const vehicleClasses = fd.getAll('vehicleClasses').map(String);
    await uploadDocument(
      ctx,
      {
        docType: str(fd, 'docType'),
        numberLast4: str(fd, 'numberLast4') || undefined,
        idType: str(fd, 'idType') || undefined,
        issuedOn: str(fd, 'issuedOn') || undefined,
        expiresOn: str(fd, 'expiresOn') || undefined,
        vehicleClasses: vehicleClasses.length ? vehicleClasses : undefined,
        consent: fd.get('consent') === 'on',
      },
      { bytes: Buffer.from(await file.arrayBuffer()), declaredType: file.type },
    );
    return t('worker.uploaded');
  });
  revalidatePath('/worker', 'layout');
  return state;
}

export async function applyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    await applyForService(ctx, str(fd, 'service'));
    return t('worker.applied');
  });
  revalidatePath('/worker', 'layout');
  return state;
}

export async function saveHoursAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    const rows: { weekday: number; startMinute: number; endMinute: number }[] = [];
    for (let d = 0; d < 7; d++) {
      if (fd.get(`off-${d}`) === 'on') continue;
      const [sh, sm] = str(fd, `from-${d}`).split(':').map(Number);
      const [eh, em] = str(fd, `to-${d}`).split(':').map(Number);
      if ([sh, sm, eh, em].some((n) => n === undefined || Number.isNaN(n))) continue;
      rows.push({ weekday: d, startMinute: sh! * 60 + sm!, endMinute: eh === 0 && em === 0 ? 1440 : eh! * 60 + em! });
    }
    await setWeeklyHours(ctx, rows);
    return t('worker.hoursSaved');
  });
  revalidatePath('/worker', 'layout');
  return state;
}
