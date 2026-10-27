# SEO plan

Status: Implemented for Milestone 1 (city and service pages, sitemap, robots, structured data, metadata). Analytics is documented but not installed. Last updated 27 October 2026.

Code: `src/app/(site)/[city]/[service]/page.tsx`, `src/modules/seo/service.ts`, `src/modules/seo/supply.ts`, `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/layout.tsx`, `src/app/(site)/page.tsx`.

## 1. City and service landing pages

- URL pattern `/{city}/{service}`, for example `/delhi/personal-driver` and `/mumbai/event-staff`. Pages are server-rendered on every request from the database (`service_cities`, `services`, `cities`), so adding a city or service is configuration, not code.
- Content comes from the service configuration: minimum hours, notice period, allowed hours, booking window, price per hour, what's included, and the cancellation rule.
- Tier C services never get a page. Tier B services (social companion) return 404 while their feature flag is off.

### When a page is indexable

`getCityServicePage()` computes `indexable = supply.live`, where `live` means all of:

1. The service is `active`, not Tier C, and any feature flag it needs is on.
2. The city-service row has status `live`.
3. The number of verified, active workers who could serve it today is at least `service_cities.go_live_min_workers` (default 10, pending sign-off, decisions.md P-01). Verified means active account and profile, KYC verified, approved for the service, required documents and police certificate approved and not expired, and at least one service zone in that city.

The page's robots meta is `index, follow` only when `indexable` is true **and** `APP_ENV=production`. Otherwise it is `noindex, follow`, and the page shows "Coming soon to {city}" with a waitlist form instead of the booking form.

The same live rule also gates search and booking, so a page is never indexable while booking is refused, or the other way round.

## 2. Sitemap (`/sitemap.xml`)

Generated per request (`dynamic = 'force-dynamic'`) from the database. It lists `/`, `/how-it-works`, `/work-with-us`, and every city-service page whose status is `live` and whose supply meets the threshold, with `lastModified` from the city-service row. A page appears the moment it goes live and disappears the moment supply drops, with no deploy needed. Acceptance test `m1-seo-sitemap` covers this. Worker profiles, search results, booking, account, worker portal and admin pages are not listed.

## 3. Robots (`/robots.txt`)

- Outside production (`APP_ENV` local, test, staging): `Disallow: /` for all agents.
- Production: allow everything except `/api/`, `/admin`, `/worker`, `/account`, `/bookings`, `/checkout`, `/sign-in`, and point to the sitemap.

The root layout also sets `noindex, nofollow` for every page outside production. Search, confirm, checkout, bookings, account, sign-in, worker portal and admin pages set `noindex` in all environments.

## 4. Metadata

- Every customer page sets its own title and description from the i18n catalogue. City pages: "{Service} in {City} | Saathi" with a description naming the minimum hours, notice and hourly price.
- Canonical tags on `/`, `/{city}/{service}`, `/how-it-works`, `/work-with-us` and `/code-of-conduct`.
- One `h1` per page. Breadcrumb navigation on city pages.
- `metadataBase` comes from `SITE_URL`, so canonical and sitemap URLs switch automatically when the domain is chosen (decisions.md V-10).

## 5. Structured data actually emitted

| Page | Types | Notes |
|---|---|---|
| Home | `Organization` | Name, URL from `SITE_URL`, area served Delhi, Noida, Gurugram |
| Home | `FAQPage` | Only the four questions visibly shown in the page's FAQ section |
| City-service page | `BreadcrumbList` | Home, then the service and city |
| City-service page | `Service` | Name, description, `areaServed`, provider. An `Offer` with the hourly INR price is included only when the page is live |

No `Review` or `AggregateRating` markup anywhere. Add it only when real, visible reviews exist on the page (section 13 of the brief).

## 6. Worker profiles

`/workers/{id}` is `noindex` unless the worker has opted in (`worker_profiles.search_index_opt_in`, default false). There is no opt-in control in the worker portal yet. Profiles are never in the sitemap.

## 7. Hindi and hreflang (planned)

- All customer strings already go through `t()` with an English catalogue (`src/i18n/en.ts`) and `HTML_LANG` maps `en` to `en-IN`.
- When Hindi ships: add a `hi` catalogue with the same shape, serve Hindi pages under `/hi/...`, set `lang="hi"`, and add `alternates.languages` (`en-IN`, `hi-IN`, `x-default`) to each page's metadata and to sitemap entries. Load Noto Sans Devanagari only then.
- City and service names in Hindi need a data field (not built).

## 8. Analytics and Search Console (not installed)

Nothing is installed. GA4 is a new vendor that needs approval (not yet listed in [decisions.md](decisions.md)) and a consent banner under the DPDP Act before any tracking (Needs legal/CA confirmation on consent wording).

Setup steps once approved:

1. Verify the production domain in Google Search Console with a DNS TXT record. Submit `/sitemap.xml`.
2. Create a GA4 property and web data stream for the production domain only.
3. Add a consent banner that defaults to denied (Google Consent Mode v2) and loads GA4 only after consent.
4. Send only the funnel events below, with no personal data: no phone, name, address, booking ref or worker id in event parameters.
5. Mark `booking_confirmed` as the key event.

Proposed funnel events:

| Event | When | Parameters |
|---|---|---|
| `city_service_view` | City-service page viewed | `city`, `service`, `live` |
| `search_submitted` | Search form submitted | `city`, `service`, `duration_hours` |
| `search_results` | Results page shown | `city`, `service`, `count_bucket` |
| `worker_chosen` | "Choose" pressed | `city`, `service` |
| `sign_in_completed` | OTP verified | `is_new` |
| `booking_created` | Booking created, waiting for payment | `city`, `service`, `value` in rupees |
| `payment_failed` | Sandbox or gateway failure | `city`, `service` |
| `booking_confirmed` | Payment captured | `city`, `service`, `value` |
| `booking_completed` | End code accepted | `city`, `service` |
| `rating_submitted` | Rating sent | `score` |
| `waitlist_joined` | Waitlist form sent | `city`, `service` |

## 9. Performance (affects ranking)

Customer pages are server components with very little client JavaScript (the mobile menu, sign-in form and form wrappers). Fonts load through `next/font` with `display: swap`. The headline, not an image, is the largest element on each page. No Core Web Vitals have been measured yet; see [testing-strategy.md](testing-strategy.md) section 8.
