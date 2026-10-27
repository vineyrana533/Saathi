'use server';

import { headers } from 'next/headers';
import { joinWaitlist } from '@/modules/seo/service';
import { runAction, str } from '../../../_lib/actions';
import type { ActionState } from '@/ui/action-form';
import { t } from '@/i18n';

export async function joinWaitlistAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const h = await headers();
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    await joinWaitlist(
      {
        citySlug: str(fd, 'citySlug'),
        serviceSlug: str(fd, 'serviceSlug'),
        name: str(fd, 'name'),
        phone: str(fd, 'phone'),
        need: str(fd, 'need'),
        wantedOn: str(fd, 'wantedOn'),
      },
      ip,
    );
    return t('cityService.waitlistDone', { city: str(fd, 'cityName') });
  });
}
