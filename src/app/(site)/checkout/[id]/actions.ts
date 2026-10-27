'use server';

import { redirect } from 'next/navigation';
import { payWithSandbox } from '@/modules/payments/service';
import { runAction, str } from '../../../_lib/actions';
import { pageSession } from '../../../_lib/session';
import { t } from '@/i18n';
import type { ActionState } from '@/ui/action-form';

export async function sandboxPayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const bookingId = str(fd, 'bookingId');
  const outcome = str(fd, 'outcome') === 'failed' ? 'failed' : 'captured';
  let done = false;
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    const res = await payWithSandbox(ctx, bookingId, outcome);
    if (res.status === 'processed' && res.result === 'captured_and_confirmed') done = true;
    else if (res.status === 'processed' && res.result === 'marked_failed') return t('checkout.failed');
  });
  if (done) redirect(`/bookings/${bookingId}`);
  return state?.ok && state.message ? { ok: false, message: state.message, at: Date.now() } : state;
}
