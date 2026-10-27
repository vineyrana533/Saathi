# Saathi: Security, Privacy and Safety

Status: Design for v1. Last updated: 27 October 2026.

Nothing in this document is a legal conclusion. Every legal or tax point is marked "Needs legal/CA confirmation" and tracked in [decisions.md](decisions.md).

Related documents: [roles-and-permissions.md](roles-and-permissions.md), [system-architecture.md](system-architecture.md), [database-design.md](database-design.md), [booking-lifecycle.md](booking-lifecycle.md), [module-catalog.md](module-catalog.md), [implementation-roadmap.md](implementation-roadmap.md).

## 1. Threat model summary

Saathi puts strangers together in the physical world and handles identity documents and money. The main risks, and the main controls for each, are below.

| Threat | Who is harmed | Main controls |
|---|---|---|
| Unsafe or fake worker | Customer | Phone OTP, licensed KYC or DigiLocker, police verification before first booking, category documents with expiry, selfie match, moderated photo, ratings, quality flags |
| Unsafe customer | Worker | Phone OTP, customer ID checks for higher-risk categories, worker can decline without penalty, SOS, check-ins, gender preference, reports |
| Harm during a job | Both | Start and end OTP, live location sharing with emergency contact, SOS creating a priority incident, scheduled check-ins with escalation, masked calls |
| Prohibited services (sexual, intimate, massage, therapy claims, private-space companion meetings, minors) | Everyone, and the platform's legal standing | Keyword and pattern moderation on profiles, services, requests, chat and reviews; photo moderation; service config rules; code of conduct; suspension on repeat violations |
| Account takeover | Users | OTP hashing, short expiry, attempt limits, rate limits, session hashing, httpOnly cookies, session revocation |
| Cross-tenant data access (customer to customer, worker to worker, agency to agency, company to company) | Users and partners | Server-side permission checks plus Postgres row-level security; app runs as a non-owner role without BYPASSRLS |
| Identity document leakage | Workers | App-level AES-256-GCM encryption, private storage, short-lived access through an audited route, role-limited access, no documents in URLs or logs |
| Payment fraud and double charging | Customers and the platform | Verified webhook signatures, idempotent webhook processing, unique payment ids, double-entry ledger with balance enforcement, reconciliation |
| Double booking | Customers and workers | Row lock plus database exclusion constraint on overlapping slots |
| Off-platform leakage | The platform | Masked contact, chat scanning for contact and payment details, easy rebooking, leakage pattern flags |
| Secrets exposure | Everyone | Secrets only in environment variables, never in client bundles, logs or URLs; separate secrets per environment |
| Abuse of OTP and search endpoints | The platform (SMS cost, scraping) | Rate limits per phone, IP and user |

## 2. Verification controls (master prompt section 7)

| Control | Design | Status |
|---|---|---|
| Phone OTP for every account | 6-digit OTP, HMAC-hashed with a server secret, 5 min expiry, 5 attempts, rate limited. Dev SMS adapter in non-production; fixed test OTP only for listed test phones and never in production. | Planned M1 |
| Worker identity verification through a licensed KYC provider or DigiLocker, with explicit consent | KYC adapter interface. M1 ships a manual-review dev adapter where a verifier records the result. Consent is captured and stored before any KYC call. Vendor pending decision. | Planned M1 (dev adapter); vendor integration Planned M3 |
| Never store full Aadhaar | Only verification result, provider reference and masked number (last 4 digits) are stored. Input fields never accept a full Aadhaar number into our database. See section 5. | Planned M1 |
| Police verification certificate or provider background check before first booking | Document type `police_verification` required for every launch category. Booking eligibility checks it. | Planned M1 (document and check); provider route Planned M3 |
| Category-specific documents with expiry tracking and automatic suspension | `driving_licence` with vehicle class and expiry for Personal driver. Search excludes workers whose required document is not valid on the booking date. Daily sweep job marks documents expired and suspends the category approval. | Planned M1 |
| Selfie match against ID | Result field on KYC record from the vendor. Manual verifier decision in the dev adapter. | Planned M1 (manual); vendor Planned M3 |
| Moderated profile photo | Photos stay hidden until a moderator approves. | Planned M1 |
| Customer identity checks for higher-risk categories | Service config flag `customerVerificationRequired`. Enforced at booking. Required for Tier B. | Planned M3 (engine); Planned M6 (Tier B use) |
| Admin verification queue | Queue with filters, document viewer through the audited route, approve or reject with reason. | Planned M1 |
| Code of conduct acceptance stored with version | Required before first booking for customers and workers. Version and timestamp stored. | Planned M1 |
| Audit log | Every sensitive read and every admin write records actor, action, target, request id and time. | Planned M1 |
| Row-level security | Tenant tables have RLS policies; app role cannot bypass them. | Planned M1 |

## 3. During a booking

| Control | Design | Status |
|---|---|---|
| Start and end OTP | Generated on confirmation, stored hashed, shown only to the customer. Worker enters it to start and to end. 5 attempts each, then ops is alerted. | Planned M1 |
| In-app chat with leakage and prohibited-content filter | See sections 10 and 11. | Planned M1 |
| Live location sharing, shareable with an emergency contact | Worker device shares location while in progress; customer and an emergency contact get a time-limited share link with an unguessable token that expires at booking end. Location history kept briefly (see retention). | Planned M3 |
| SOS button for customer and worker | Creates a priority incident, alerts ops and the user's emergency contact, attaches last known location. | Planned M3 |
| Scheduled safety check-ins | Interval from service config. Missed check-in escalates to ops. Required for long bookings and Tier B. | Planned M3 |
| Masked calling and messaging | Telephony adapter; real numbers never shown to the other party. Vendor pending. | Planned M3 |
| Gender preference and decline without penalty | Customer and worker preferences used in matching. Declines for safety reasons never count against acceptance rate. | Planned M1 (preference in search); Planned M3 (offers and decline) |
| Tier B rules | Public venues only (list or ops approval), 9 am to 10 pm, max 4 hours, verified customers only, lower limits for new customers. | Planned M6 |

## 4. After a booking

| Control | Design | Status |
|---|---|---|
| Two-way ratings | Only after completion, once per side, moderated text. | Planned M1 |
| Low ratings to quality review | Rating at or below a configured threshold creates a quality flag. Repeated low ratings flag the worker. | Planned M1 |
| Complaints, incidents and disputes with severity, owners, deadlines and audit history | Incident table with severity, owner, due time and status history. Dispute window 48 hours after completion. | Planned M3 |
| One-tap report on every profile, booking and chat thread | Creates a report routed to the moderation or incident queue. | Planned M1 (report entity and button); Planned M3 (full queue workflow) |
| Suspension on repeat or serious violations | Counter per user over a rolling window; serious violations suspend immediately; every suspension writes an audit entry. | Planned M1 (manual and counter); Planned M3 (automation) |

### Incident response targets (needs internal sign-off)

| Event | Target |
|---|---|
| SOS | Acknowledged by ops within 2 minutes |
| Safety complaint | Response within 1 hour |
| Other complaint | Response within 1 business day |

These targets become configuration with deadlines stored on each incident. They are not final until internal sign-off is recorded in [decisions.md](decisions.md).

## 5. Aadhaar and identity data

- We never store a full Aadhaar number, in any table, file, log or analytics event.
- We store only: verification result, provider name, provider reference id, masked number (last 4 digits), verification timestamp, and the consent record id.
- KYC happens through a licensed KYC provider or DigiLocker with explicit, purpose-specific consent captured first.
- If a document image that shows a full Aadhaar number is ever needed by a vendor flow, it goes directly to the vendor and is not kept by us, or is stored only in masked form. Needs legal confirmation on the exact handling rules that apply to us.
- Identity data is readable only by roles that need it (verifier, admin), only through server routes, and every read writes an audit entry.

## 6. Document storage and encryption

- Uploaded documents (driving licence, police verification, ID images, selfie) are encrypted in the application with AES-256-GCM before they reach storage. Each file gets a random 96-bit IV. The auth tag is stored with the ciphertext.
- The key comes from `DOCUMENT_ENCRYPTION_KEY` (32 bytes, base64) in environment variables. Each record stores a key version so keys can rotate without re-encrypting everything at once.
- Storage adapter: local encrypted filesystem in development, Supabase Storage private bucket in production (pending access). Files are never public and never referenced by a guessable path.
- Files are served only through `GET /api/v1/admin/documents/:id/file`, which checks the permission, decrypts in memory, streams the file with `Cache-Control: no-store`, and writes an audit log entry for every access.
- File names are random ids. Original names, numbers and personal details are never placed in paths or URLs.
- Allowed types: JPEG, PNG, PDF. Size limit is configuration. A malware scanning hook exists on the adapter for a future vendor.

## 7. DPDP Act 2023 obligations mapping

The Digital Personal Data Protection Act, 2023 and its Rules govern how we process personal data. The mapping below is our design intent. Every row needs legal confirmation, including which provisions are in force on our launch date.

| Obligation area | How Saathi plans to meet it | Status |
|---|---|---|
| Notice before or at collection, in clear language | Privacy notice page; short notices at sign-up, KYC, location sharing and marketing opt-in; versioned. Hindi notice when Hindi ships. | Planned M1 (notice and versioning); Needs legal confirmation |
| Purpose-specific consent, free and withdrawable | `consent_records` table: user, purpose, notice version, granted or withdrawn, timestamp, channel. Separate purposes: account and bookings, KYC, location during bookings, marketing messages, analytics cookies. Withdrawal as easy as giving. | Planned M1; Needs legal confirmation |
| Processing without consent for legitimate uses | Only where the law allows (for example a user voluntarily providing data for a specified purpose). Each such use is listed in the record of processing. | Needs legal confirmation |
| Accuracy and completeness | Users can view and correct profile data. Verifiers correct document data with an audit entry. | Planned M1 |
| Reasonable security safeguards | Encryption at rest and in transit, RLS, RBAC, audit logs, rate limits, secrets management, backups. | Planned M1 |
| Personal data breach notification | Breach runbook: contain, assess, notify the Data Protection Board and affected users in the form and time the Rules require, keep a breach register. | Planned M3; Needs legal confirmation on timelines and content |
| Erasure when purpose is served or consent withdrawn | Retention schedule below, enforced by scheduled jobs; legal holds for disputes, incidents and tax records. | Planned M3; Needs legal confirmation |
| Rights of the Data Principal: access, correction, erasure, grievance redressal, nomination | Account page requests create tracked tickets with due dates; export of the user's own data; deletion workflow with legal-hold checks; grievance officer contact on every page footer. | Planned M3; Needs legal confirmation |
| Children's data | Under-18 users are not allowed as customers or workers. Age check at worker registration (date of birth from ID) and age declaration for customers. No processing designed for children. | Planned M1; Needs legal confirmation |
| Grievance officer | Named contact published in the footer and privacy notice. `[SUPPORT EMAIL AND PHONE]` placeholder until provided. | Not Started; needs your input |
| Data processors (vendors) | Contracts with KYC, SMS, telephony, payments, hosting and storage vendors that bind them to our instructions and security terms. | Not Started; Needs legal confirmation |
| Cross-border transfer | Data hosted in Mumbai regions. Any vendor processing outside India is listed and checked against government notifications. | Planned M0 (hosting choice); Needs legal confirmation |

### Proposed retention schedule (needs legal confirmation)

| Data | Proposed retention | Reason |
|---|---|---|
| OTP challenges | 24 hours after expiry | Abuse investigation only |
| Sessions | Expire after 30 days idle; revoked sessions deleted after 30 days | Security |
| Booking records, price snapshots, invoices | 8 years after the financial year ends | Tax and accounting records (Needs CA confirmation) |
| Ledger entries, payments, refunds, payouts | 8 years after the financial year ends | Tax and accounting records (Needs CA confirmation) |
| Chat messages | 1 year after booking completion, longer under a legal hold for an incident or dispute | Safety investigations |
| Live location points | 30 days after booking end, longer under a legal hold | Safety investigations |
| Identity documents and selfies | 180 days after the worker account closes, unless under a legal hold | Verification evidence |
| KYC result, provider reference, masked number | Account life plus 3 years | Proof of verification |
| Police verification certificate | Account life plus 1 year | Proof of verification |
| Incidents, SOS events, disputes | 7 years after closure | Legal claims |
| Audit logs | 3 years | Security and accountability |
| Application logs (redacted) | 30 days | Debugging |
| Waitlist entries and leads | 12 months, or until consent is withdrawn | Demand planning and follow-up |
| Consent records | Life of the consent plus 3 years | Proof of consent |
| Marketing analytics (consented) | 14 months | Measurement |

## 8. Secrets handling

- Secrets live only in environment variables: database URLs, `SESSION_SECRET`, `OTP_HMAC_SECRET`, `DOCUMENT_ENCRYPTION_KEY`, `CRON_SECRET`, `PAYMENT_WEBHOOK_SECRET`, vendor keys.
- Startup validates every required secret with Zod and refuses to boot in production if any is missing or uses a development default.
- Nothing secret uses the `NEXT_PUBLIC_` prefix. A CI check fails the build if a known secret name appears in client code.
- Separate secrets for local, staging and production. Production secrets are set in Vercel and Supabase dashboards only by people with that access.
- `.env.example` documents every variable with a safe placeholder. `.env*` files with real values are git-ignored.
- Rotation: session and OTP secrets can rotate with a short overlap; document key rotation uses key versions.

## 9. Logging with personal data redaction

- Structured JSON logs with a request id, route, status, duration and user id (internal id only).
- A redaction layer removes or masks: phone numbers, emails, OTP codes, session tokens, cookies, authorization headers, Aadhaar-like 12-digit numbers, PAN-like values, UPI ids, addresses, document contents, and webhook bodies beyond the event id and type.
- Request and response bodies are not logged by default.
- Logs never contain secrets. A unit test feeds sample personal data through the logger and asserts it does not appear in output.
- Analytics events carry no personal data and no free text.

## 10. Prohibited content enforcement

- **Where:** profile text, service descriptions, custom request text, chat messages, review text, and profile photos (manual moderation).
- **How:** a maintained list in the `prohibited_terms` table with severity (`block` or `review`) and category (sexual or intimate, physical contact, therapy claims, minors, private-space meetings, contact sharing). Matching normalises case, accents, repeated letters, common leetspeak and spacing tricks.
- **Severity behaviour:** `block` rejects the text with a plain explanation; `review` stores the text hidden and queues it for a moderator.
- **Photos:** hidden until approved by a moderator.
- **Service configuration:** services with a prohibited pattern cannot be saved; Tier B services require the public-venue rule and the allowed-hours rule.
- **Code of conduct:** both sides accept it before their first booking; the accepted version is stored.
- **Reports:** one-tap report on every profile, booking and chat thread.
- **Escalation:** repeated `block` hits within a rolling window, or any serious violation, suspend the account and write an audit entry. Ops reviews every suspension.
- **Marketing copy:** checked against the same list before publishing; no therapy, wellness or emotional-health claims anywhere.

## 11. Off-platform leakage protection (master prompt section 8)

- Masked calls and in-app chat only. Real contact details are never exposed to the other party.
- Chat and profile text are scanned for phone numbers (including spaced digits and digits written as words), emails, social handles, UPI ids and payment links. These are blocked with a polite explanation.
- "Book again" and saved favourites make repeat bookings with the same worker easy on the platform.
- Leakage flags: a customer whose bookings with a worker stop suddenly after several in a row, repeated blocked contact-sharing attempts, or chat patterns hinting at direct payment create a `leakage_flags` entry for ops review. Flags never auto-suspend on their own.

## 12. Rate limits (proposed)

| Endpoint | Limit |
|---|---|
| OTP request | 3 per 10 minutes per phone number, and 10 per hour per IP address |
| OTP verify | 5 attempts per challenge, then the challenge is locked |
| Booking create | 10 per hour per user |
| Worker search | 60 per minute per IP address |
| Chat message post | 30 per minute per user (proposed) |
| Document upload | 20 per hour per user (proposed) |
| Webhooks | Not rate limited; signature verified first |

Limits are stored in Postgres so they hold across serverless instances. They are configuration and need internal sign-off.

## 13. Public launch gate checklist

Real customers can book only when every item is Verified and internal sign-off is recorded in [decisions.md](decisions.md).

| # | Gate | Status |
|---|---|---|
| 1 | Phone OTP for every account | Planned M1 |
| 2 | Worker KYC through a licensed provider or DigiLocker, with consent, no full Aadhaar stored | Planned M1 (dev adapter); vendor Planned M3 |
| 3 | Police verification before first booking | Planned M1 (check); provider Planned M3 |
| 4 | Category documents with expiry and automatic suspension | Planned M1 |
| 5 | Selfie match and moderated profile photo | Planned M1 (manual); vendor Planned M3 |
| 6 | Start and end OTP | Planned M1 |
| 7 | Live location sharing with emergency contact | Planned M3 |
| 8 | SOS for customer and worker | Planned M3 |
| 9 | Scheduled safety check-ins for long bookings | Planned M3 |
| 10 | Masked calling and messaging | Planned M3 |
| 11 | Gender preference and decline without penalty | Planned M1 (preference); Planned M3 (decline) |
| 12 | Two-way ratings and low-rating review | Planned M1 |
| 13 | Complaints, incidents and disputes with severity, owners, deadlines and audit history | Planned M3 |
| 14 | Incident response targets signed off and staffed | Not Started |
| 15 | Prohibited content enforcement across profiles, services, requests, chat and reviews | Planned M1 |
| 16 | Off-platform leakage protection | Planned M1 (chat filter); Planned M3 (masked calls, flags) |
| 17 | Payment gateway category approval in writing, live credentials, verified webhooks, end-to-end tests | Not Started (request prepared in M0) |
| 18 | Legal and CA confirmations (DPDP, Aadhaar, GST, TDS, labour codes, consumer protection, terms and privacy notice) | Not Started |
| 19 | Backup restore drill passed | Not Started |
| 20 | Internal sign-off recorded | Not Started |

Tier B items (customer ID for companion bookings, public venue rules, allowed hours, new-customer limits) are gated separately at Milestone 6.
