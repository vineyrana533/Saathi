'use server';

import { revalidatePath } from 'next/cache';
import { activateWorker, reviewDocument, reviewServiceApplication } from '@/modules/workers/service';
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
