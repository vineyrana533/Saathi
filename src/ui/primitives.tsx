import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'onDark';

const base =
  'inline-flex items-center justify-center gap-2 min-h-12 px-5 rounded-xs font-semibold text-body leading-none transition-colors duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] disabled:cursor-not-allowed active:translate-y-px';
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-strong disabled:bg-paper-2 disabled:text-ink-3',
  secondary: 'border border-ink text-ink bg-transparent hover:bg-paper-2 disabled:border-rule disabled:text-ink-3',
  ghost: 'text-ink hover:bg-paper-2 disabled:text-ink-3',
  danger: 'bg-danger text-white hover:brightness-95 disabled:bg-paper-2 disabled:text-ink-3',
  onDark: 'border border-ink-on-dark text-ink-on-dark hover:bg-ink-on-dark hover:text-ink',
};

export const buttonClass = (variant: Variant = 'primary', extra = '') => `${base} ${variants[variant]} ${extra}`;

export function ButtonLink({ variant = 'primary', className = '', ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link {...props} className={buttonClass(variant, className)} />;
}

export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`container-page ${className}`}>{children}</div>;
}

export function PageHeading({ eyebrow, title, lede }: { eyebrow?: string; title: ReactNode; lede?: ReactNode }) {
  return (
    <div className="pt-10 pb-8 md:pt-14">
      {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
      <h1 className="font-display text-h1 font-bold text-balance">{title}</h1>
      {lede && <p className="mt-4 text-body-l text-ink-2 prose-measure">{lede}</p>}
    </div>
  );
}

export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="font-display text-h2 font-bold text-balance">
      {children}
    </h2>
  );
}

/** Label, optional help, control and error, wired with ids for screen readers. */
export function Field({
  id,
  label,
  help,
  optional,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  optional?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-small font-semibold text-ink">
        {label}
        {optional && <span className="font-normal text-ink-3"> {optional}</span>}
      </label>
      {help && (
        <p id={`${id}-help`} className="-mt-1 text-small text-ink-3">
          {help}
        </p>
      )}
      {children}
    </div>
  );
}

export const inputClass =
  'w-full min-h-12 rounded-xs border border-field-border bg-surface px-3 py-2 text-[1rem] text-ink placeholder:text-ink-3 hover:border-ink-2 focus-visible:border-ink aria-[invalid=true]:border-danger disabled:bg-paper-2 disabled:text-ink-3';

export function Input(props: ComponentProps<'input'>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} aria-describedby={props['aria-describedby'] ?? (props.id ? `${props.id}-help` : undefined)} />;
}

export function Select(props: ComponentProps<'select'>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea {...props} className={`${inputClass} min-h-28 ${props.className ?? ''}`} />;
}

export function Checkbox({ id, label, ...rest }: ComponentProps<'input'> & { id: string; label: ReactNode }) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
      <input id={id} type="checkbox" className="mt-0.5 size-5 shrink-0 accent-ink" {...rest} />
      <span className="text-body">{label}</span>
    </label>
  );
}

type Tone = 'warning' | 'info' | 'trust' | 'success' | 'neutral' | 'danger';
const toneClass: Record<Tone, string> = {
  warning: 'bg-warning-tint text-warning',
  info: 'bg-info-tint text-info',
  trust: 'bg-trust-tint text-trust',
  success: 'bg-success-tint text-success',
  neutral: 'bg-paper-2 text-ink-2',
  danger: 'bg-danger-tint text-danger',
};
const toneIcon: Record<Tone, string> = { warning: '●', info: '●', trust: '▶', success: '✓', neutral: '○', danger: '!' };

export const STATUS_TONE: Record<string, Tone> = {
  pending_payment: 'warning',
  confirmed: 'info',
  in_progress: 'trust',
  completed: 'success',
  cancelled: 'neutral',
  expired: 'neutral',
  no_show_worker: 'danger',
  no_show_customer: 'danger',
  disputed: 'danger',
  refunded: 'neutral',
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  applied: 'warning',
  suspended: 'danger',
  active: 'success',
  applicant: 'warning',
  live: 'success',
  waitlist: 'warning',
  paused: 'neutral',
  // Requests and quotes (Milestone 2)
  submitted: 'warning',
  in_review: 'info',
  sourcing: 'info',
  quoted: 'trust',
  accepted: 'success',
  declined: 'neutral',
  draft: 'neutral',
  sent: 'warning',
  change_requested: 'info',
  withdrawn: 'neutral',
};

/** Text + colour + icon, never colour alone. */
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-xs px-2 py-1 text-label font-semibold ${toneClass[tone]}`}>
      <span aria-hidden="true" className="text-[0.6rem]">
        {toneIcon[tone]}
      </span>
      {children}
    </span>
  );
}

export function VerifiedBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-xs bg-trust-tint px-2 py-1 text-label font-semibold text-trust">
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M6 1 10 2.5V6c0 2.4-1.7 4.2-4 5-2.3-.8-4-2.6-4-5V2.5L6 1Z" stroke="currentColor" strokeWidth="1.2" />
        <path d="m4 6 1.5 1.5L8 4.8" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      {children}
    </span>
  );
}

export function Notice({ tone = 'info', title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  return (
    <div className={`rounded-xs border-l-4 px-4 py-3 ${toneClass[tone]} ${tone === 'danger' ? 'border-danger' : tone === 'warning' ? 'border-warning' : tone === 'success' ? 'border-success' : 'border-trust'}`}>
      {title && <p className="font-semibold">{title}</p>}
      <div className="text-small text-ink">{children}</div>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="border-y border-rule py-10">
      <h3 className="font-display text-h3 font-semibold">{title}</h3>
      <p className="mt-2 text-ink-2 prose-measure">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export interface PriceLineView {
  label: string;
  amount: string;
}

export function PriceTable({ caption, lines, totalLabel, total, footnote }: { caption: string; lines: PriceLineView[]; totalLabel: string; total: string; footnote?: ReactNode }) {
  return (
    <div className="border border-rule-strong bg-surface p-5">
      <table className="w-full text-body">
        <caption className="sr-only">{caption}</caption>
        <tbody>
          {lines.map((l) => (
            <tr key={l.label}>
              <th scope="row" className="py-1.5 pr-4 text-left font-normal text-ink-2">
                {l.label}
              </th>
              <td className="py-1.5 text-right tabular">{l.amount}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-ink">
            <th scope="row" className="pt-3 text-left font-display text-h4 font-bold">
              {totalLabel}
            </th>
            <td className="pt-3 text-right font-display text-h3 font-bold tabular">{total}</td>
          </tr>
        </tfoot>
      </table>
      {footnote && <p className="mt-4 text-small text-ink-2">{footnote}</p>}
    </div>
  );
}

export function Timeline({ items }: { items: { title: string; time: string; current?: boolean }[] }) {
  return (
    <ol className="relative ml-1.5 border-l border-rule-strong">
      {items.map((it, i) => (
        <li key={i} className="relative pb-5 pl-5 last:pb-0">
          <span
            aria-hidden="true"
            className={`absolute -left-[7px] top-1.5 size-3 rounded-full ${it.current ? 'border-2 border-accent bg-paper' : 'bg-ink'}`}
          />
          <p className="font-semibold">
            {it.title}
            {it.current && <span className="sr-only"> (current step)</span>}
          </p>
          <p className="text-small text-ink-3">{it.time}</p>
        </li>
      ))}
    </ol>
  );
}

/** Intentional placeholder until licensed photography exists (design-system.md section 5). */
export function ImagePlaceholder({ description, ratio = '4 / 3', className = '' }: { description: string; ratio?: string; className?: string }) {
  return (
    <div
      role="img"
      aria-label={`Placeholder for a photo: ${description}`}
      className={`flex items-end border border-rule-strong bg-paper-2 p-4 ${className}`}
      style={{ aspectRatio: ratio }}
    >
      <p className="eyebrow text-ink-3">Photo needed: {description}</p>
    </div>
  );
}

export function Avatar({ name, size = 72 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center bg-trust font-display font-bold text-ink-on-dark"
      style={{ width: size, height: Math.round(size * 1.25), fontSize: size / 2.6 }}
    >
      {initials}
    </div>
  );
}

export function Pagination({ page, hasNext, hrefFor }: { page: number; hasNext: boolean; hrefFor: (p: number) => string }) {
  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center gap-4">
      {page > 1 ? (
        <Link className="link" href={hrefFor(page - 1)}>
          Previous
        </Link>
      ) : (
        <span className="text-ink-3">Previous</span>
      )}
      <span aria-current="page" className="font-semibold underline underline-offset-4">
        Page {page}
      </span>
      {hasNext ? (
        <Link className="link" href={hrefFor(page + 1)}>
          Next
        </Link>
      ) : (
        <span className="text-ink-3">Next</span>
      )}
    </nav>
  );
}
