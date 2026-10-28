'use server';

import { revalidatePath } from 'next/cache';
import { sendChatMessage, createReport } from '@/modules/chat/service';
import { cancelBooking, startJob, finishJob } from '@/modules/bookings/service';
import { rateBooking } from '@/modules/reviews/service';
import { formatInr } from '@/modules/pricing/engine';
import { runAction, str } from './actions';
import { pageSession } from './session';
import { t } from '@/i18n';
import { AppError } from '@/platform/errors';
import type { ActionState } from '@/ui/action-form';

function refresh(bookingId: string) {
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath(`/worker/jobs/${bookingId}`);
}

export async function sendChatAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const bookingId = str(fd, 'bookingId');
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    const out = await sendChatMessage(ctx, bookingId, { body: str(fd, 'body') });
    if (out.notice) throw new AppError('chat_blocked', out.notice, 422);
  });
  refresh(bookingId);
  return state;
}

export async function cancelAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const bookingId = str(fd, 'bookingId');
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    const out = await cancelBooking(ctx, { bookingId, reason: str(fd, 'reason'), feltUnsafe: fd.get('unsafe') === 'on' });
    return out.feePaise > 0 ? `${t('booking.cancelled')} ${t('booking.cancelFeeLate', { fee: formatInr(out.feePaise) })}` : t('booking.cancelled');
  });
  refresh(bookingId);
  return state;
}

export async function rateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const bookingId = str(fd, 'bookingId');
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    await rateBooking(ctx, bookingId, { score: Number(str(fd, 'score')), comment: str(fd, 'comment') || undefined, workerId: str(fd, 'workerId') || undefined });
    return t('booking.rated');
  });
  refresh(bookingId);
  return state;
}

export async function reportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await pageSession();
    await createReport(ctx, {
      entityType: str(fd, 'entityType') as 'booking' | 'worker_profile',
      entityId: str(fd, 'entityId'),
      reason: str(fd, 'reason') as 'other',
      details: str(fd, 'details') || undefined,
    });
    return t('booking.reported');
  });
}

export async function jobCodeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const bookingId = str(fd, 'bookingId');
  const phase = str(fd, 'phase');
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    if (phase === 'end') await finishJob(ctx, bookingId, str(fd, 'code'));
    else await startJob(ctx, bookingId, str(fd, 'code'));
  });
  refresh(bookingId);
  return state;
}
