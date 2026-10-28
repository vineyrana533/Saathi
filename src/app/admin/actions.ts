'use server';

import { revalidatePath } from 'next/cache';
import { activateWorker, reviewDocument, reviewServiceApplication } from '@/modules/workers/service';
import { reviewIdCheck } from '@/modules/identity/id-check';
import { assignWorkerToBooking, releaseWorkerFromBooking } from '@/modules/bookings/team';
import { cancelRequestAsStaff, claimRequest, reopenRequest, saveQuoteDraft, sendQuote, setRequestStage, withdrawQuote } from '@/modules/requests/assisted';
import { formatInr } from '@/modules/pricing/engine';
import { formatIst } from '@/platform/time';
import type { Ctx } from '@/platform/db/client';
import { setServiceCityStatus, updateServiceCityPricing } from '@/modules/catalog/service';
import { pricingConfigSchema } from '@/modules/catalog/config';
import { setWaitlistStatus, type FollowUpStatus } from '@/modules/seo/service';
import { setEnquiryStatus } from '@/modules/requests/service';
import { runAction, str } from '../_lib/actions';
import { pageSession } from '../_lib/session';
import { invalid } from '@/platform/errors';
import type { ActionState } from '@/ui/action-form';

export async function reviewDocumentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    await reviewDocument(ctx, { documentId: str(fd, 'documentId'), decision: str(fd, 'decision') === 'approved' ? 'approved' : 'rejected', note: str(fd, 'note') || undefined });
    return 'Saved.';
  });
  revalidatePath('/admin', 'layout');
  return state;
}

export async function activateWorkerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    await activateWorker(ctx, str(fd, 'workerId'));
    return 'Worker activated.';
  });
  revalidatePath('/admin', 'layout');
  return state;
}

export async function reviewApplicationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    await reviewServiceApplication(ctx, { approvalId: str(fd, 'approvalId'), decision: str(fd, 'decision') === 'approved' ? 'approved' : 'rejected', reason: str(fd, 'reason') || undefined });
    return 'Saved.';
  });
  revalidatePath('/admin', 'layout');
  return state;
}

export async function updatePriceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    const current = pricingConfigSchema.parse(JSON.parse(str(fd, 'current')));
    const rupees = Number(str(fd, 'hourlyRupees'));
    if (!Number.isFinite(rupees) || rupees <= 0 || rupees > 100000) throw invalid('invalid_price', 'Enter an hourly price in rupees', { field: 'hourlyRupees' });
    const commissionPct = Number(str(fd, 'commissionPct'));
    if (!Number.isFinite(commissionPct) || commissionPct < 0 || commissionPct > 60) throw invalid('invalid_commission', 'Commission must be between 0 and 60%', { field: 'commissionPct' });
    await updateServiceCityPricing(ctx, {
      serviceCityId: str(fd, 'serviceCityId'),
      pricing: { ...current, hourlyRatePaise: Math.round(rupees * 100), commissionBps: Math.round(commissionPct * 100) },
    });
    return 'Price updated. Existing bookings keep their original price.';
  });
  revalidatePath('/admin/catalog');
  return state;
}

export async function setStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    const status = str(fd, 'status');
    if (status !== 'live' && status !== 'waitlist' && status !== 'paused') throw invalid('invalid_status', 'Pick a status');
    await setServiceCityStatus(ctx, { serviceCityId: str(fd, 'serviceCityId'), status });
    return 'Status updated.';
  });
  revalidatePath('/admin/catalog');
  return state;
}

export async function setWaitlistStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    await setWaitlistStatus(ctx, { id: str(fd, 'id'), status: str(fd, 'status') as FollowUpStatus });
  });
  revalidatePath('/admin/waitlist');
  return state;
}

export async function setEnquiryStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    await setEnquiryStatus(ctx, { id: str(fd, 'id'), status: str(fd, 'status') as FollowUpStatus });
  });
  revalidatePath('/admin/waitlist');
  return state;
}

export async function reviewIdCheckAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    await reviewIdCheck(ctx, { checkId: str(fd, 'checkId'), decision: str(fd, 'decision') === 'approved' ? 'approved' : 'rejected', note: str(fd, 'note') || undefined });
    return 'Saved.';
  });
  revalidatePath('/admin', 'layout');
  return state;
}

// ---------- Team bookings ----------

export async function assignWorkerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    const out = await assignWorkerToBooking(ctx, { bookingId: str(fd, 'bookingId'), workerId: str(fd, 'workerId') });
    return `Assigned. ${out.filled} of ${out.needed} places filled.`;
  });
  revalidatePath('/admin', 'layout');
  return state;
}

export async function releaseWorkerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    await releaseWorkerFromBooking(ctx, { bookingId: str(fd, 'bookingId'), workerId: str(fd, 'workerId'), reason: str(fd, 'reason') });
    return 'Taken off the booking. The place is now empty.';
  });
  revalidatePath('/admin', 'layout');
  return state;
}

// ---------- Requests and quotes ----------

function requestAction(fn: (ctx: Ctx, fd: FormData) => Promise<string>) {
  return async (fd: FormData): Promise<ActionState> => {
    const state = await runAction(async () => {
      const { ctx } = await pageSession();
      return fn(ctx, fd);
    });
    revalidatePath('/admin', 'layout');
    return state;
  };
}

const claim = requestAction(async (ctx, fd) => {
  await claimRequest(ctx, str(fd, 'requestId'));
  return 'You own this request now.';
});
export async function claimRequestAction(_: ActionState, fd: FormData) {
  return claim(fd);
}

const stage = requestAction(async (ctx, fd) => {
  await setRequestStage(ctx, { requestId: str(fd, 'requestId'), to: str(fd, 'to') === 'sourcing' ? 'sourcing' : 'in_review' });
  return 'Status updated.';
});
export async function setRequestStageAction(_: ActionState, fd: FormData) {
  return stage(fd);
}

const cancelReq = requestAction(async (ctx, fd) => {
  await cancelRequestAsStaff(ctx, { requestId: str(fd, 'requestId'), reason: str(fd, 'reason') });
  return 'Request cancelled.';
});
export async function cancelRequestStaffAction(_: ActionState, fd: FormData) {
  return cancelReq(fd);
}

const reopen = requestAction(async (ctx, fd) => {
  await reopenRequest(ctx, str(fd, 'requestId'));
  return 'Request reopened.';
});
export async function reopenRequestAction(_: ActionState, fd: FormData) {
  return reopen(fd);
}

const draft = requestAction(async (ctx, fd) => {
  const out = await saveQuoteDraft(ctx, {
    requestId: str(fd, 'requestId'),
    workersCount: str(fd, 'workersCount'),
    durationMinutes: str(fd, 'durationMinutes'),
    hourlyRateRupees: str(fd, 'hourlyRateRupees'),
    proposedWorkerIds: fd.getAll('proposedWorkerIds').map(String),
    messageToCustomer: str(fd, 'messageToCustomer') || undefined,
  });
  return `Draft saved. Customer total ${formatInr(out.totalPaise)}.`;
});
export async function saveQuoteDraftAction(_: ActionState, fd: FormData) {
  return draft(fd);
}

const send = requestAction(async (ctx, fd) => {
  const out = await sendQuote(ctx, str(fd, 'quoteId'));
  return `Quote sent. Valid until ${formatIst(out.expiresAt)}.`;
});
export async function sendQuoteAction(_: ActionState, fd: FormData) {
  return send(fd);
}

const withdraw = requestAction(async (ctx, fd) => {
  await withdrawQuote(ctx, { quoteId: str(fd, 'quoteId'), reason: str(fd, 'reason') });
  return 'Quote withdrawn.';
});
export async function withdrawQuoteAction(_: ActionState, fd: FormData) {
  return withdraw(fd);
}
