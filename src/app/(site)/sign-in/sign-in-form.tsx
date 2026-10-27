'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Labels {
  phone: string;
  send: string;
  codeTitle: string;
  code: string;
  verify: string;
  change: string;
  resend: string;
  errorTitle: string;
  generic: string;
}

/** Two-step phone OTP sign-in against /api/v1/auth. Supports paste and SMS autofill. */
export function SignInForm({ labels, next }: { labels: Labels; next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  async function call(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error?.message ?? labels.generic);
        setTimeout(() => errorRef.current?.focus(), 0);
        return null;
      }
      return data;
    } catch {
      setError(labels.generic);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (await call('/api/v1/auth/otp/request', { phone })) {
      setStep('code');
      setCode('');
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (await call('/api/v1/auth/otp/verify', { phone, code })) {
      router.replace(next);
      router.refresh();
    }
  }

  const masked = phone.replace(/\D/g, '').slice(-4);

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div ref={errorRef} tabIndex={-1} role="alert" className="border-l-4 border-danger bg-danger-tint px-4 py-3">
          <p className="font-semibold text-danger">{labels.errorTitle}</p>
          <p className="text-small">{error}</p>
        </div>
      )}
      {step === 'phone' ? (
        <form onSubmit={sendCode} className="flex flex-col gap-6" noValidate>
          <div className="flex flex-col gap-2">
            <label htmlFor="f-phone" className="text-small font-semibold">
              {labels.phone}
            </label>
            <div className="flex">
              <span className="inline-flex min-h-12 items-center border border-r-0 border-field-border bg-paper-2 px-3 font-semibold">+91</span>
              <input
                id="f-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="min-h-12 w-full rounded-none border border-field-border bg-surface px-3 text-[1rem] focus-visible:border-ink"
              />
            </div>
          </div>
          <button type="submit" disabled={busy} aria-busy={busy} className="min-h-12 rounded-xs bg-accent px-5 font-semibold text-white hover:bg-accent-strong disabled:opacity-70">
            {labels.send}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-6" noValidate>
          <p className="font-semibold">{labels.codeTitle.replace('{phone}', `+91 ••••••${masked}`)}</p>
          <div className="flex flex-col gap-2">
            <label htmlFor="f-code" className="text-small font-semibold">
              {labels.code}
            </label>
            <input
              id="f-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="min-h-14 w-full max-w-60 rounded-xs border border-field-border bg-surface px-4 font-display text-h3 font-bold tracking-[0.4em] tabular focus-visible:border-ink"
            />
          </div>
          <button type="submit" disabled={busy || code.length !== 6} aria-busy={busy} className="min-h-12 rounded-xs bg-accent px-5 font-semibold text-white hover:bg-accent-strong disabled:opacity-70">
            {labels.verify}
          </button>
          <div className="flex flex-wrap gap-6 text-small">
            <button type="button" className="link" onClick={() => setStep('phone')}>
              {labels.change}
            </button>
            <button type="button" className="link" onClick={() => sendCode()} disabled={busy}>
              {labels.resend}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
