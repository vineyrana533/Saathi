'use client';

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

export type ActionState = { ok: boolean; message?: string; field?: string; at?: number } | null;

const PendingContext = createContext(false);

/**
 * Form wrapper for server actions: shows an error summary that receives focus and links to the
 * failing field (WCAG 3.3.1), or a success message in a polite live region.
 * With JavaScript, submission goes through a transition so the form keeps what the person typed
 * when there is an error (React resets forms submitted via the `action` prop). Without JavaScript,
 * the native form post still works.
 */
export function ActionForm({
  action,
  children,
  errorTitle,
  className = '',
  encType,
  resetOnSuccess = false,
}: {
  action: (state: ActionState, data: FormData) => Promise<ActionState>;
  children: ReactNode;
  errorTitle: string;
  className?: string;
  encType?: 'multipart/form-data';
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const summary = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state && !state.ok) summary.current?.focus();
    if (state?.ok && resetOnSuccess) form.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={form}
      action={formAction}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className={`flex flex-col gap-6 ${className}`}
      encType={encType}
      noValidate
    >
      {state && !state.ok && (
        <div ref={summary} tabIndex={-1} role="alert" className="border-l-4 border-danger bg-danger-tint px-4 py-3">
          <p className="font-semibold text-danger">{errorTitle}</p>
          <p className="text-small text-ink">
            {state.field ? (
              <a className="link" href={`#${state.field}`}>
                {state.message}
              </a>
            ) : (
              state.message
            )}
          </p>
        </div>
      )}
      {state?.ok && state.message && (
        <p role="status" className="border-l-4 border-success bg-success-tint px-4 py-3 text-small">
          {state.message}
        </p>
      )}
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
    </form>
  );
}

export function SubmitButton({ children, variant = 'primary', className = '' }: { children: ReactNode; variant?: 'primary' | 'secondary' | 'danger'; className?: string }) {
  const status = useFormStatus();
  const pending = useContext(PendingContext) || status.pending;
  const styles = {
    primary: 'bg-accent text-white hover:bg-accent-strong',
    secondary: 'border border-ink text-ink hover:bg-paper-2',
    danger: 'bg-danger text-white',
  }[variant];
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xs px-5 font-semibold transition-colors duration-[120ms] disabled:opacity-70 ${styles} ${className}`}
    >
      {children}
      {pending && <span aria-hidden="true" className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
    </button>
  );
}
