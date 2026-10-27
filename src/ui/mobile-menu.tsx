'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/** Full-screen mobile menu: focus trapped, Escape closes, focus returns to the trigger, body scroll locked. */
export function MobileMenu({
  links,
  cta,
  labels,
}: {
  links: { href: string; label: string }[];
  cta: { href: string; label: string };
  labels: { menu: string; close: string };
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusables = () => Array.from(sheet.current?.querySelectorAll<HTMLElement>('a,button') ?? []);
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const els = focusables();
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const triggerEl = trigger.current;
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
      triggerEl?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 px-2 font-semibold lg:hidden"
      >
        {labels.menu}
        <svg aria-hidden="true" width="20" height="14" viewBox="0 0 20 14">
          <path d="M0 1h20M0 7h20M0 13h20" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <div id="mobile-menu" ref={sheet} role="dialog" aria-modal="true" aria-label={labels.menu} className="fixed inset-0 z-50 flex flex-col bg-paper px-4 pb-6">
          <div className="flex h-16 items-center justify-end">
            <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-2 font-semibold">
              {labels.close}
            </button>
          </div>
          <nav className="flex-1">
            <ul>
              {links.map((l) => (
                <li key={l.href} className="border-b border-rule">
                  <Link href={l.href} onClick={() => setOpen(false)} className="block py-4 font-display text-h2 font-bold">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <Link href={cta.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center justify-center rounded-xs bg-accent font-semibold text-white">
            {cta.label}
          </Link>
        </div>
      )}
    </>
  );
}
