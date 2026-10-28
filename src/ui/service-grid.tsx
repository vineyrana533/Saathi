import Image from 'next/image';
import Link from 'next/link';
import { cropped, SERVICE_MEDIA } from './service-media';
import { Pill } from './primitives';

export interface ServiceCardData {
  slug: string;
  name: string;
  summary: string;
  href: string;
  statusTone: 'success' | 'warning' | 'neutral';
  statusLabel: string;
  priceLabel: string | null;
}

/**
 * Service cards with two tilted photos that fan out on hover (pointer devices, motion allowed).
 * The name is the link; its ::after covers the whole card so the card is one target for the
 * pointer, while screen readers hear a single clear link.
 */
export function ServiceGrid({
  services,
  other,
}: {
  services: ServiceCardData[];
  other: { title: string; body: string; cta: string; href: string };
}) {
  // With an even number of services the last card would sit alone, so it becomes a full-width banner.
  const wide = services.length % 2 === 0;
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:gap-6">
      {services.map((s) => {
        const media = SERVICE_MEDIA[s.slug];
        return (
          <li
            key={s.slug}
            className="group relative flex min-h-[25rem] flex-col rounded-xs bg-paper-2 p-6 transition-colors duration-200 ease-ui has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus [@media(hover:hover)]:hover:bg-accent-tint"
          >
            <div aria-hidden="true" className="relative mb-6 flex h-60 items-center justify-center">
              {media ? (
                <>
                  <Image
                    src={cropped(media.back.src)}
                    alt=""
                    width={176}
                    height={220}
                    sizes="176px"
                    className="absolute w-36 -translate-x-14 -rotate-6 rounded-xs object-cover shadow-pop transition-transform duration-300 ease-ui sm:w-44 motion-safe:[@media(hover:hover)]:group-hover:-translate-x-20 motion-safe:[@media(hover:hover)]:group-hover:-rotate-[10deg] motion-safe:[@media(hover:hover)]:group-hover:scale-105"
                  />
                  <Image
                    src={cropped(media.front.src)}
                    alt=""
                    width={176}
                    height={220}
                    sizes="176px"
                    className="absolute w-36 translate-x-14 rotate-3 rounded-xs object-cover shadow-pop transition-transform duration-300 ease-ui sm:w-44 motion-safe:[@media(hover:hover)]:group-hover:translate-x-20 motion-safe:[@media(hover:hover)]:group-hover:rotate-[6deg] motion-safe:[@media(hover:hover)]:group-hover:scale-105"
                  />
                </>
              ) : null}
            </div>
            <div className="mt-auto">
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-display text-h3 font-bold">
                  <Link href={s.href} className="outline-none after:absolute after:inset-0 after:content-['']">
                    {s.name}
                  </Link>
                </h3>
                <span aria-hidden="true" className="mt-1 text-h4 transition-transform duration-200 ease-ui [@media(hover:hover)]:group-hover:translate-x-1">
                  →
                </span>
              </div>
              <p className="mt-2 text-ink-2">{s.summary}</p>
              <p className="mt-4 flex flex-wrap items-center gap-3 text-small">
                <Pill tone={s.statusTone}>{s.statusLabel}</Pill>
                {s.priceLabel && <span className="text-ink-2 tabular">{s.priceLabel}</span>}
              </p>
            </div>
          </li>
        );
      })}
      <li className={`on-dark group relative flex flex-col justify-between gap-8 rounded-xs bg-ink p-6 text-ink-on-dark ${wide ? 'sm:col-span-2 sm:flex-row sm:items-end lg:p-10' : 'min-h-[25rem]'} has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus-on-dark`}>
        <span aria-hidden="true" className="font-display text-display-l font-extrabold leading-none text-marigold">
          +
        </span>
        <div>
          <h3 className="font-display text-h3 font-bold text-balance">{other.title}</h3>
          <p className="mt-2 text-ink-on-dark-2">{other.body}</p>
          <p className="mt-6">
            <Link
              href={other.href}
              className="inline-flex min-h-12 items-center gap-2 rounded-xs border border-ink-on-dark px-5 font-semibold outline-none after:absolute after:inset-0 after:content-[''] [@media(hover:hover)]:group-hover:bg-ink-on-dark [@media(hover:hover)]:group-hover:text-ink"
            >
              {other.cta} <span aria-hidden="true">→</span>
            </Link>
          </p>
        </div>
      </li>
    </ul>
  );
}
