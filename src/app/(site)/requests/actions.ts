'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { acceptQuote, cancelMyRequest, createServiceRequest, respondToQuote } from '@/modules/requests/assisted';
import { acceptConsent } from '@/modules/identity/service';
import { runAction, str } from '../../_lib/actions';
import { pageSession } from '../../_lib/session';
import { unauthenticated } from '@/platform/errors';
import { t } from '@/i18n';
import type { ActionState } from '@/ui/action-form';

export async function createRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string | undefined;
  const state = await runAction(async () => {
    const { ctx, session } = await pageSession();
    if (!session) throw unauthenticated();
    if (fd.get('conduct') === 'on') await acceptConsent(ctx, 'code_of_conduct');
    const answers: Record<string, string> = {};
    for (const [k, v] of fd.entries()) if (k.startsWith('a.') && typeof v === 'string') answers[k.slice(2)] = v;
    const budget = str(fd, 'budgetRupees');
    const out = await createServiceRequest(ctx, {
      serviceSlug: str(fd, 'service'),
      citySlug: str(fd, 'city'),
      localityId: str(fd, 'loc') || undefined,
      lat: str(fd, 'lat') || undefined,
      lng: str(fd, 'lng') || undefined,
      date: str(fd, 'date'),
      time: str(fd, 'time'),
      durationMinutes: str(fd, 'durationMinutes'),
      workersNeeded: str(fd, 'workersNeeded'),
      answers,
      addressLine: str(fd, 'addressLine'),
      landmark: str(fd, 'landmark') || undefined,
      details: str(fd, 'details'),
      budgetRupees: budget ? budget : undefined,
    });
    id = out.id;
  });
  if (id) redirect(`/requests/${id}`);
  return state;
}

export async function acceptQuoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let bookingId: string | undefined;
  const state = await runAction(async () => {
    const { ctx, session } = await pageSession();
    if (!session) throw unauthenticated();
    if (fd.get('conduct') === 'on') await acceptConsent(ctx, 'code_of_conduct');
    bookingId = (await acceptQuote(ctx, str(fd, 'quoteId'))).bookingId;
  });
  if (bookingId) redirect(`/checkout/${bookingId}`);
  return state;
}

export async function respondQuoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const requestId = str(fd, 'requestId');
  const action = str(fd, 'action') === 'change' ? 'change' : 'decline';
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    await respondToQuote(ctx, { quoteId: str(fd, 'quoteId'), action, note: str(fd, 'note') || undefined });
    return action === 'change' ? t('requests.changeSent') : t('requests.declined');
  });
  revalidatePath(`/requests/${requestId}`);
  return state;
}

export async function cancelRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const requestId = str(fd, 'requestId');
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    await cancelMyRequest(ctx, { requestId, reason: str(fd, 'reason') });
    return t('requests.cancelled');
  });
  revalidatePath(`/requests/${requestId}`);
  return state;
}
