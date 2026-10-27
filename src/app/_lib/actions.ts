import { unstable_rethrow } from 'next/navigation';
import { ZodError } from 'zod';
import { isAppError } from '@/platform/errors';
import { log } from '@/platform/logger';
import { errorText, t } from '@/i18n';
import type { ActionState } from '@/ui/action-form';

/** Runs a server action body and converts known errors into form state. Redirects pass through. */
export async function runAction(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await fn();
    return { ok: true, message: message || undefined, at: Date.now() };
  } catch (e) {
    unstable_rethrow(e);
    if (isAppError(e)) {
      const field = typeof e.details?.field === 'string' ? `f-${e.details.field.replace(/\./g, '-')}` : undefined;
      return { ok: false, message: errorText(e.code, e.message), field, at: Date.now() };
    }
    if (e instanceof ZodError) {
      const issue = e.issues[0];
      const field = issue?.path?.length ? `f-${issue.path.join('-')}` : undefined;
      return { ok: false, message: issue?.message ?? t('common.genericError'), field, at: Date.now() };
    }
    log.error('server action failed', { error: e });
    return { ok: false, message: t('common.genericError'), at: Date.now() };
  }
}

export const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v.trim() : '';
};
