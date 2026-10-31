'use server';

import { redirect } from 'next/navigation';
import { createBooking } from '@/modules/bookings/service';
import { acceptConsent } from '@/modules/identity/service';
import { runAction, str } from '../../../../_lib/actions';
import { pageSession } from '../../../../_lib/session';
import { unauthenticated } from '@/platform/errors';
import type { ActionState } from '@/ui/action-form';

export async function confirmBookingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let bookingId: string | undefined;
  const state = await runAction(async () => {
    const { ctx, session } = await pageSession();
    if (!session) throw unauthenticated();
    if (fd.get('conduct') === 'on') await acceptConsent(ctx, 'code_of_conduct');
    const answers: Record<string, string> = {};
    for (const [k, v] of fd.entries()) if (k.startsWith('a.') && typeof v === 'string') answers[k.slice(2)] = v;
    const out = await createBooking(ctx, {
      serviceSlug: str(fd, 'service'),
      citySlug: str(fd, 'city'),
      zoneId: str(fd, 'zone') || undefined,
      localityId: str(fd, 'loc') || undefined,
      lat: str(fd, 'lat') ? Number(str(fd, 'lat')) : undefined,
      lng: str(fd, 'lng') ? Number(str(fd, 'lng')) : undefined,
      date: str(fd, 'date'),
      time: str(fd, 'time'),
      durationMinutes: Number(str(fd, 'duration')),
      answers,
      workerId: str(fd, 'worker'),
      addressLine: str(fd, 'addressLine'),
      landmark: str(fd, 'landmark') || undefined,
      expectedTotalPaise: Number(str(fd, 'expectedTotalPaise')),
    });
    bookingId = out.bookingId;
  });
  if (bookingId) redirect(`/checkout/${bookingId}`);
  return state;
}
