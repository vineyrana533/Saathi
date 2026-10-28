'use server';

import { headers } from 'next/headers';
import { createEnquiry } from '@/modules/requests/service';
import { runAction, str } from '../../_lib/actions';
import { t } from '@/i18n';
import type { ActionState } from '@/ui/action-form';

export async function createEnquiryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const h = await headers();
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    await createEnquiry(
      {
        name: str(fd, 'name'),
        phone: str(fd, 'phone'),
        citySlug: str(fd, 'citySlug'),
        need: str(fd, 'need'),
        wantedOn: str(fd, 'wantedOn'),
        consent: fd.get('consent') === 'on',
      },
      ip,
    );
    return t('request.done');
  });
}
