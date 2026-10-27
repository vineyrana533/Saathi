'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { revokeSession, updateMyProfile, acceptConsent } from '@/modules/identity/service';
import { SESSION_COOKIE } from '@/platform/http';
import { runAction, str } from '../../_lib/actions';
import { pageSession } from '../../_lib/session';
import { t } from '@/i18n';
import type { ActionState } from '@/ui/action-form';

export async function saveAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    await updateMyProfile(ctx, {
      displayName: str(fd, 'displayName'),
      email: str(fd, 'email'),
      gender: str(fd, 'gender') as '' | 'female',
    });
    return t('account.saved');
  });
  revalidatePath('/account');
  return state;
}

export async function acceptConductAction(): Promise<ActionState> {
  const state = await runAction(async () => {
    const { ctx } = await pageSession();
    await acceptConsent(ctx, 'code_of_conduct');
    return t('conduct.accepted');
  });
  revalidatePath('/code-of-conduct');
  return state;
}

export async function logoutAction() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  jar.delete(SESSION_COOKIE);
  redirect('/');
}
