# Saathi: Product Requirements

Status: Draft for Milestone 0 and 1. Owner: product and tech lead.
Last updated: 27 October 2026.

Related documents: [system-architecture.md](system-architecture.md), [module-catalog.md](module-catalog.md), [booking-lifecycle.md](booking-lifecycle.md), [roles-and-permissions.md](roles-and-permissions.md), [security-privacy-and-safety.md](security-privacy-and-safety.md), [decisions.md](decisions.md), [design-system.md](design-system.md).

## 1. Product summary

Saathi (working name) is a multi-category marketplace and operations platform for India. Anyone can find and hire a suitable, verified person for a specific need. Customers either book a person directly or describe the need and let our team find the right person.

The platform has three faces:

- A customer website and account, server-rendered for search and speed.
- A mobile-first worker portal on the web, with native apps later.
- An operations and admin dashboard that runs verification, matching, money, safety and quality.

One shared core powers every category. Categories, cities, pricing, documents and safety rules are configuration, not code. The first category to launch end to end is Personal driver in Delhi NCR.

## 2. Users and jobs to be done

| User | Main jobs to be done |
|---|---|
| Customer | Find a verified person for a specific need and time, see the full price before paying, book and pay safely, stay in touch through the platform, get help when something goes wrong, book the same person again. |
| Worker (independent or company-managed) | Sign up with a phone number, prove identity and skills once, get approved per category, set availability and service areas, receive suitable jobs, start and finish jobs with OTP, get paid on time, see earnings and fees clearly, decline unsafe jobs without penalty. |
| Operations staff (ops) | Watch bookings and requests, fix unfilled jobs, handle complaints, incidents and SOS, contact customers and workers through masked channels, run assisted matching and quotes. |
| Verifier | Review identity, police verification and category documents, approve or reject with reasons, track expiry. |
| Admin | Configure cities, zones, categories, services, pricing, policies, feature flags, roles and templates. Manage users and suspensions. |
| Finance | See the ledger, reconcile with gateway and payout reports, approve refunds and payouts, export GST data. |
| Agency or partner (after v1) | Onboard their own workers, receive and allocate assignments, track fulfilment and settlements. Never see another agency's data. |
| Corporate customer (after v1) | Let authorised bookers book within approval rules and budgets, get consolidated GST invoices and usage reports. Never see another company's bookings. |

## 3. Launch market

- Country: India. Currency INR only, stored as integer paise.
- Launch cities: Delhi, Noida and Gurugram (region "Delhi NCR"), and Mumbai.
- Rollout: supply recruitment and marketing start in Delhi NCR. Mumbai is configured from day one and opens for bookings only when it passes the city go-live threshold (section 17 of the master prompt).
- Worker sign-up is open in every configured city at all times.
- Cities, zones and per-city service availability are database records managed in the admin dashboard.
- Language: English at launch. Every user-facing string goes through the i18n layer so Hindi can ship later.
- Time zone: display in Asia/Kolkata, store in UTC.
- Phone: +91 numbers, OTP login as the primary method.
- Distance: kilometres.

## 4. Categories by risk tier

| Tier | Category | Launch state |
|---|---|---|
| A | Personal driver (customer's own vehicle; hourly, full day, outstation) | First end-to-end workflow, Milestone 1 |
| A | Event and business staff (hosts, ushers, helpers, promoters, registration desk) | Milestone 2, mostly assisted matching and quotes, multi-worker bookings |
| A | Errands and appointment assistance (queues, document runs, shopping help, non-medical accompaniment) | Milestone 3 |
| B | Social companion, platonic only, public places only | Built behind an admin feature flag. Enabled only in Milestone 6 after the safety review and internal sign-off |
| C | Childcare, nursing or medical care, security guards (PSARA), in-home domestic help, any licensed professional service | Not at launch. The engine supports extra documents and approval steps so these can be added without a rebuild |

## 5. Prohibited services and conduct

These are hard rules. They are enforced in code, in profile and listing moderation, in chat moderation and in all marketing copy. The enforcement design is in [security-privacy-and-safety.md](security-privacy-and-safety.md).

Never allowed:

- Sexual, intimate or romantic services of any kind, including dating, "girlfriend or boyfriend experience" or escort-style offers.
- Massage, cuddling, or any service built around physical contact.
- Anything described as therapy, counselling or treatment, unless provided by a verified licensed professional in a Tier C category.
- Overnight companion bookings, and companion meetings at a private home, hotel room or other private space.
- Any booking where a worker or customer is under 18.
- Services that need a licence the worker does not hold.

Marketing pages, meta descriptions and ads describe services in plain, non-suggestive language. No therapy, wellness or emotional-health claims anywhere.

## 6. v1 scope by module

| ID | Module | In v1 launch? |
|---|---|---|
| M01 | Platform Foundation | Yes |
| M02 | Identity, Users, Roles, Organisations | Yes |
| M03 | Configurable Service Catalogue | Yes |
| M04 | Worker and Provider Management (incl. verification) | Yes |
| M05 | Availability and Scheduling | Yes |
| M06 | Customer Experience (website and account) | Yes |
| M07 | Booking and Service Request Engine | Yes |
| M08 | Pricing and Quotations | Yes |
| M09 | Matching and Dispatch | Yes (manual plus simple rules) |
| M10 | Worker Portal | Yes (web, mobile-first) |
| M11 | Agency and Partner Portal | After v1 |
| M12 | Corporate Customer Portal | After v1 |
| M13 | Payments, Ledger, Earnings, Payouts | Yes (core) |
| M14 | Subscriptions and Monetisation | After v1 |
| M15 | CRM and Follow-up Automation | Basic in v1 |
| M16 | Communication Centre | Yes (email, SMS, in-app, masked calling) |
| M17 | AI and Voice Assistant | After v1 |
| M18 | Admin and Operations | Yes (core) |
| M19 | Trust, Safety, Disputes | Yes (all of section 7) |
| M20 | Reviews and Quality | Yes |
| M21 | Analytics and Reporting | Basic in v1 |
| M22 | Integrations, Monitoring, Reliability | Yes |
| M23 | SEO and City/Service Pages | Yes |

Module details are in [module-catalog.md](module-catalog.md). Milestone order is in [implementation-roadmap.md](implementation-roadmap.md).

## 7. Functional requirements

### A. Customer website and account

- A1. Discover services by category and city. Only services enabled for that city appear as bookable.
- A2. Search, or describe a need in free text that becomes an assisted request.
- A3. Browse eligible, available workers with filters: location, availability, service, price, skills, language, gender, rating.
- A4. Worker profiles show services, experience, verified badges, languages, availability, pricing and reviews. They never show real phone numbers, exact home addresses or documents.
- A5. Book directly or submit a custom request.
- A6. See a full price breakdown before paying. The breakdown shown equals the stored price snapshot.
- A7. Pay, track status, chat through the platform, reschedule or cancel by policy.
- A8. View invoices, payments and refunds.
- A9. Rate and review, only after a completed booking.
- A10. Save favourites and use "Book again".
- A11. Raise complaints, and use one-tap report on profiles, bookings and chat threads.
- A12. Manage the account: profile, phone, emergency contact, gender preference, consent and channel preferences, data access and deletion requests.
- A13. Accept the code of conduct before the first booking. The accepted version is stored.

### B. Direct booking

- B1. The customer picks service, city or zone, address, start time and duration.
- B2. Only eligible and genuinely available workers are listed. Eligible means: active account, approved for that category, required documents valid on the booking date, serves that zone, meets the service's minimum rating, and matches any gender preference.
- B3. Unavailable workers are never shown as bookable for a conflicting slot.
- B4. At confirmation the server re-checks eligibility, availability, pricing and scheduling inside one database transaction. A row lock on the worker and a database exclusion constraint on overlapping slots prevent double booking.
- B5. A new booking holds the slot in pending_payment for up to 15 minutes (configurable). Stale holds expire and release the slot.

### C. Assisted matching and quotes (Milestone 2)

1. The customer describes the need.
2. The system collects location, timing, duration, number of people, budget, skills and details.
3. A service request is created with a first-response deadline.
4. Eligible workers and agencies are suggested.
5. Ops reviews, contacts providers, and collects availability or quotes.
6. The customer receives a quote or proposed match with an expiry time.
7. The customer accepts, asks for changes, or declines.
8. An accepted quote becomes a confirmed booking with a price snapshot.
9. Fulfilment, payment, feedback and follow-up are tracked.

Every step has a status, owner, deadline, assignment history and audit log.

### D. Worker platform

Registration, OTP login, account recovery, profile, skills, experience, languages, service areas, category applications, document uploads, verification status, expiry alerts, availability calendar and working hours, job offers, accept or decline, job details, start and end OTP, check-ins, SOS, completion, earnings, fees, payout history, ratings, notifications, support and account restrictions. Registration never means approval for every service. Approval is per category.

### E. Three workforce models

All three are in the data model from the start:

1. Independent workers who register, verify and receive suitable jobs.
2. Company-managed workers recruited and scheduled by us (the worker is linked to our own organisation).
3. Agencies and partners who onboard their own workers and receive assignments (portal after v1).

The data model separates user account, customer profile, worker profile, organisation, agency or partner, corporate customer, service provider, booking and worker assignment. Tenant isolation is enforced in the API and in Postgres row-level security.

### F. Admin and operations dashboard

Manage customers, workers, verification queues, agencies, corporate accounts, cities and zones, categories and services, booking forms, eligibility, pricing, fees, commissions, cancellation policies, bookings, requests, quotes, assignments, manual and automatic matching, scheduling conflicts, unfilled jobs, payments, refunds, settlements, payouts, complaints, incidents, SOS events, disputes, review moderation, prohibited-content queue, promotions, notifications, automation rules, reports, roles, permissions, audit logs and system settings. Every list has real search, filters, pagination and validation, plus empty, loading and error states. No fake metrics.

### G. Agency and corporate portals (after v1)

- Agencies: workforce management, incoming requests, worker allocation, fulfilment tracking, earnings and settlements.
- Corporates: company account, authorised bookers, approval rules, budgets, recurring bookings, consolidated GST invoices and usage reports.

### H. CRM and follow-up automation (basic in v1)

Leads and enquiries with source tracking, status, owner, reminders, incomplete-booking follow-ups, pending-quote reminders, post-service feedback requests, repeat-booking reminders, reactivation, notes, interaction history, templates, consent and channel preferences, deduplication, retries and opt-outs. Every automated message is logged and never sent twice, enforced by a unique idempotency key per message.

### I. Communication and AI

Adapters for email, SMS, push, in-app chat, WhatsApp Business, masked calling and later AI voice. The AI assistant (after v1) may understand a request, ask follow-up questions, pick the category, collect details, check real options through authorised backend functions and create an enquiry. It never invents prices, availability, qualifications, worker identities or confirmations. It gets explicit confirmation before booking or charging. Unconfigured integrations run in a clearly labelled sandbox mode.

### J. Reviews and quality

Two-way ratings, review moderation, review only after a completed booking, worker quality scores, and automatic flags for repeated low ratings.

### K. Analytics and reporting (basic in v1)

Bookings (total, completed, cancelled), conversion funnel, revenue, commission, outstanding payments and payouts, worker utilisation and acceptance, unfilled requests and time to match, cancellations and refunds, repeat customers, agency and corporate performance, category and city performance, CRM results and safety incidents. All figures come from stored data or are clearly labelled sample data.

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | Customer pages on a mid-range Android phone over 4G: Largest Contentful Paint under 2.5 s, Interaction to Next Paint under 200 ms, Cumulative Layout Shift under 0.1. Server-rendered pages, self-hosted fonts, and no animation that delays hero text. |
| Accessibility | WCAG 2.2 AA. Keyboard navigable, visible focus, sufficient contrast, labelled form fields, errors announced to screen readers, reduced motion respected. See [design-system.md](design-system.md). |
| Security | Secrets only in environment variables. RBAC plus Postgres row-level security. Rate limits on auth, OTP, search and booking. Encrypted documents. Audit log for sensitive actions. See [security-privacy-and-safety.md](security-privacy-and-safety.md). |
| Privacy | Aligned with the DPDP Act 2023: purpose-specific consent, consent records, notice, access and deletion requests, breach handling and retention limits. No personal data in URLs, logs or analytics. |
| Reliability | Transactions and concurrency control for booking and money operations. Idempotency for anything that can be retried. Daily backups with a tested restore. Structured logs, error monitoring and uptime checks. |
| Data residency | Database, storage and server functions in Mumbai regions (Supabase ap-south-1, Vercel bom1). |
| i18n | English at launch. All strings through the message catalogue. Hindi-ready layouts and hreflang support. |
| Money | Integer paise only. The double-entry ledger is the source of truth. Confirmed bookings keep their price snapshot. |
| Mobile | APIs are designed so a React Native or Expo app can use them later. |
| Quality | CI on every pull request: type check, lint, tests and build. |

## 9. Business defaults (configuration)

These were approved as starting values on 27 October 2026. All values are configuration, editable per city and per service, and recorded in [decisions.md](decisions.md).

| Setting | Default |
|---|---|
| Platform commission | 20% of service price |
| Minimum booking | 2 hours (personal driver: 4 hours) |
| Booking lead time | 3 hours before start (assisted requests: 24 hours) |
| Free cancellation | More than 24 hours before start |
| Late cancellation fee | 50% between 24 and 2 hours before start |
| Very late cancellation or customer no-show | 100% |
| Worker no-show | Full customer refund, worker strike, ops tries a replacement |
| Quote validity | 48 hours |
| First response on assisted requests | Within 2 business hours |
| Worker payouts | Weekly, after booking completion and dispute window |
| Dispute window | 48 hours after completion |
| Companion bookings (Tier B, when enabled) | Public venues only, 9 am to 10 pm, max 4 hours, verified customers only |
| City-service go-live threshold | 10 verified active workers per service (needs internal sign-off) |
| Payment hold before expiry | 15 minutes (proposed) |

## 10. Risky assumptions

Each of these could change scope, cost or launch dates. Each is tracked in [decisions.md](decisions.md).

1. **Payment gateway category approval.** We assume Razorpay or Cashfree will approve a multi-category human-services marketplace. Companion-style services are often restricted, which may block Tier B even if Tier A is approved. Live payments stay off until written approval arrives.
2. **Supply density.** We assume we can reach 10 verified active drivers per city-service in Delhi NCR quickly. If not, city pages stay noindex and bookings stay assisted only.
3. **Police verification turnaround.** We assume police verification certificates or a provider-run background check can be completed within a few days. Slow turnaround delays every worker's first booking.
4. **KYC vendor and DigiLocker access.** We assume a licensed KYC provider or a DigiLocker integration is available to us on reasonable terms, with consent flows that meet Aadhaar rules.
5. **Masked calling cost and reliability.** We assume a telephony provider can mask calls between customers and workers at a per-minute cost that fits our margins.
6. **DPDP Rules timing and detail.** We assume the Digital Personal Data Protection Rules apply in phases and that our consent, notice and retention design will fit them. Needs legal confirmation.
7. **GST treatment of commission and fees.** We assume GST applies to platform commission and fees and that the platform may have other obligations as an aggregator. Tax logic stays configuration until a chartered accountant confirms. Needs CA confirmation.
8. **TDS on worker payouts.** We assume TDS obligations may apply to payouts. The rate defaults to zero in configuration until confirmed. Needs CA confirmation.
9. **Gig worker social security.** We assume aggregator obligations under the Code on Social Security, 2020 (registration and possible welfare contributions) may apply to us once notified for our category. Needs legal confirmation.
10. **Mumbai demand.** We assume Mumbai demand is strong enough to justify recruiting there after Delhi NCR. Waitlist data will test this before we spend on supply.
11. **OTP-only login is enough.** We assume phone OTP is acceptable as the primary login for all user types, including ops staff. Staff accounts may need a second factor later.
12. **Repeat bookings stay on platform.** We assume masked contact, chat filtering and easy "Book again" keep leakage low. Leakage flags will measure this.

## 11. Out of scope for v1

- Agency and partner portal (M11), corporate portal (M12), subscriptions (M14), AI and voice assistant (M17).
- Tier B companion bookings (built, flag off) and all Tier C categories.
- Hindi content (strings are ready; translations ship later).
- Native mobile apps.
- WhatsApp Business messaging.
- Live payments and real payouts, until gateway approval, credentials and end-to-end tests are verified.
- Full analytics dashboards (basic reports only in v1).
