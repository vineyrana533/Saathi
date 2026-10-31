# API contracts

Status: Implemented for Milestone 1. Last updated 27 October 2026.

The web UI mostly uses Next.js server actions (`src/app/**/actions.ts`, `src/app/_lib/booking-actions.ts`). Those actions call the same domain services as the routes below, with the same validation and permission checks. The REST routes exist so mobile apps and integrations can use the same backend.

## 1. Conventions

- **Base path:** `/api/v1` for app endpoints, `/api/webhooks` for gateways, `/api/cron` for jobs.
- **Format:** JSON in and out, except the document file route (binary). Bodies over 64 KB are rejected.
- **Auth:** send `Authorization: Bearer <token>` (mobile) or the `saathi_session` cookie (web). The Bearer header wins if both are present. Tokens come from `POST /api/v1/auth/otp/verify`. Only a SHA-256 hash of the token is stored; sessions last 30 days.
- **Caching:** every route wrapped by `api()` (`src/platform/http.ts`) sends `Cache-Control: no-store`.
- **Request id:** an `x-request-id` header is used for audit entries if sent; otherwise one is generated.

### Error format

```json
{ "error": { "code": "worker_unavailable", "message": "This person is no longer available for that time. Please pick someone else.", "details": null } }
```

| Source | Status | Code |
|---|---|---|
| Service `AppError` | as thrown (400, 401, 403, 404, 409, 422, 423, 429) | as thrown |
| Zod validation failure | 422 | `invalid_input`, `details.issues` lists problems |
| Malformed JSON or body too large | 400 | `invalid_json` |
| Anything else | 500 | `internal` (details are logged, never returned) |

Field-level errors put the field name in `details.field` (for example `addressLine`, `answers.vehicle_class`).

### Rate limits (`src/platform/rate-limit.ts`)

Fixed windows stored in Postgres, so they hold across serverless instances. Exceeding one returns `429 rate_limited`. Values are pending sign-off (decisions.md T-14).

| Rule | Key | Limit |
|---|---|---|
| OTP request | per phone | 3 per 10 minutes |
| OTP request | per IP | 10 per hour |
| OTP verify | per phone | 10 per 10 minutes |
| Booking create | per user | 10 per hour |
| Search | per IP | 60 per minute |
| Chat send | per user | 30 per minute |
| Waitlist join | per IP | 5 per hour (server action only) |
| Job code entry | per booking | 10 per 10 minutes |

## 2. Auth

### `POST /api/v1/auth/otp/request`
Public. Body `{ "phone": string }` (10 to 20 characters; any common Indian format, normalised to `+91XXXXXXXXXX`).
200: `{ "expiresInSeconds": 300, "sandbox": true }`. No SMS is sent while the SMS adapter is `dev-log`; listed test phones get code `123456` outside production.
Errors: `invalid_phone` (422), `rate_limited` (429).

### `POST /api/v1/auth/otp/verify`
Public. Body `{ "phone": string, "code": string }` (6 digits).
200: `{ "token": string, "userId": uuid, "isNew": boolean }`, plus `Set-Cookie: saathi_session=...; HttpOnly; SameSite=Lax; Max-Age=2592000` (`Secure` when `SITE_URL` is https). New users get the `customer` role.
Errors: `invalid_code` (422), `otp_wrong` (422), `otp_expired` (422), `otp_locked` (422, after 5 wrong codes), `otp_suspended` (403), `rate_limited` (429).

### `POST /api/v1/auth/logout`
Revokes the current session and clears the cookie. 200 `{ "ok": true }`.

### `GET /api/v1/me`
Signed in. 200 `{ "userId", "displayName", "phone" (masked, e.g. "+91 ••••••0005"), "roles": string[] }`. 401 `unauthenticated`.

## 3. Catalogue and search

### `GET /api/v1/catalog`
Public. 200:
```json
{ "services": [{ "service": "personal-driver", "name": "...", "summary": "...", "city": "delhi", "cityName": "Delhi", "status": "live|waitlist|paused", "hourlyRatePaise": 25000 }],
  "zones": [{ "id": "uuid", "name": "South Delhi", "slug": "south-delhi", "cityId": "uuid", "cityName": "Delhi", "citySlug": "delhi" }] }
```
Tier C services and services whose status is not `active` are left out.

### `GET /api/v1/search`
Public (a session is optional and used for gender-preference matching). Rate limited per IP.
Query: `service`, `city`, the job location as `loc` (locality uuid), or `lat` and `lng` (a phone location; tied to the nearest locality, refused with `location_outside_city` if more than 30 km from every locality of the city), or `zone` (uuid; older clients, matched by zone without distance), `date` (YYYY-MM-DD, IST), `time` (HH:MM, IST), `duration` (minutes), `gender` (`female` or `male`, optional), `page` (default 1), and booking answers as `a.<questionId>` (for drivers `a.vehicle_class=LMV&a.transmission=manual`).
200:
```json
{ "live": true,
  "quote": { "lines": [{ "code": "service", "label": "Personal driver, 4 hours", "amountPaise": 100000 }], "totalPaise": 100000, "pricingVersion": 1 },
  "workers": [{ "id": "uuid", "displayName": "...", "bio": "...", "languages": ["Hindi"], "gender": "male", "yearsExperience": 5, "ratingAvgX100": 0, "ratingCount": 0, "photoApproved": true, "distanceKm": 3.8 }],
  "hasMore": false }
```
Workers come nearest first (adjusted for rating and recent workload, decisions.md T-47). `distanceKm` is the straight-line distance from their home base to the job, rounded to 0.1 km, or null when either is unknown. When the city-service is not live (status or supply below threshold) the response is `{ "live": false, "quote": null, "workers": [] }`.
Errors: `not_found`, `invalid_zone`, `invalid_locality`, `location_required`, `location_outside_city`, `invalid_duration`, `invalid_time`, `too_soon`, `too_far`, `outside_hours`, `missing_answer`, `invalid_answer`, `answer_blocked` (all 422 except `not_found` 404), `rate_limited`.

## 4. Bookings

### `GET /api/v1/bookings`
Signed in. The caller's own bookings as customer: `{ "bookings": [{ "id", "ref", "status", "startsAt", "endsAt", "totalPaise", "serviceName", "serviceSlug", "cityName", "zoneName", "workerName", "workerId" }] }`.

### `POST /api/v1/bookings`
Signed in with `booking.create` (customer, ops, admin, corporate admin). Rate limited per user.
Body:
```json
{ "serviceSlug": "personal-driver", "citySlug": "delhi", "localityId": "uuid", "date": "2026-11-03", "time": "10:00",
  "durationMinutes": 240, "answers": { "vehicle_class": "LMV", "transmission": "manual" },
  "workerId": "uuid", "addressLine": "Flat 12, Block C", "landmark": "optional", "expectedTotalPaise": 100000 }
```
201: `{ "bookingId", "ref", "totalPaise", "holdExpiresAt", "payment": { "id", "provider": "sandbox", "mode": "sandbox", "orderId" } }`. The worker is held for 15 minutes while payment completes.
Errors: `address_blocked` (contact details in the address), `conduct_required` (403), `not_found`, `customer_id_required` (409), `not_live` (409), `invalid_zone`, slot errors as in search, `price_changed` (409, `details.totalPaise` has the current total), `worker_unavailable` (409, also returned when the database exclusion constraint catches a race), `rate_limited`.

### `GET /api/v1/bookings/{id}`
Signed in. Returns 404 to anyone who is not the customer, the assigned worker, or staff with `booking.read`; this is also enforced by row-level security. 401 when anonymous.
200 fields: `viewer` (`customer`, `worker`, `staff`), `id`, `ref`, `status`, `startsAt`, `endsAt`, `serviceName`, `serviceSlug`, `cityName`, `citySlug`, `zoneName`, `addressLine` and `landmark` (null for the worker until the booking is paid), `answers`, `price` (customer lines and total; null for the worker), `workerEarning` (null for the customer), `totalPaise` (null for the worker), `holdExpiresAt`, `holdExpired`, `cancellationPolicy`, `cancelFeeNowPaise`, `cancelReason`, `cancelledBy`, `worker` `{ id, name, ratingAvgX100, ratingCount }`, `customerName` (null for the customer), `payment` (null for the worker), `codes` `{ start, end }` (customer only: start while confirmed, end while in progress), `otpLocked`, `events[]` `{ at, from, to, by }`.

### `POST /api/v1/bookings/{id}/cancel`
Customer, assigned worker, or staff. Body `{ "reason": string (max 300), "feltUnsafe": boolean? }`.
200 `{ "feePaise": number, "band": "free" | "late" | "very_late" | "none" }`.
Errors: `reason_required`, `not_found`, `cannot_cancel` (409, only `pending_payment` and `confirmed` can be cancelled here).

### `POST /api/v1/bookings/{id}/pay-sandbox`
Customer only, sandbox only. Body `{ "outcome": "captured" | "failed" }` (default `captured`). Asks the sandbox gateway for the signed webhook it would send and processes it through the real webhook path.
200: the webhook outcome, for example `{ "status": "processed", "result": "captured_and_confirmed" }` or `{ "status": "processed", "result": "marked_failed" }`.
Errors: `not_found`, `not_sandbox`, `not_payable` (409).

### `POST /api/v1/bookings/{id}/start` and `POST /api/v1/bookings/{id}/finish`
Assigned worker only (`booking.start_finish`). Body `{ "code": "1234" }`.
200 `{ "ok": true, "status": "in_progress" | "completed" }`. Finishing posts the completion journal and asks the customer to rate.
Errors: `forbidden` (not a worker), `invalid_code` (not 4 digits), `rate_limited`, `not_found` (not your job), `wrong_status` (409), `otp_locked` (423, after 5 wrong codes), `outside_start_window` (409, start only: 60 minutes before to 120 minutes after the booked start), `wrong_code` (422, `details.attempts`).

### `GET /api/v1/bookings/{id}/messages` and `POST /api/v1/bookings/{id}/messages`
Booking participants and staff. GET 200 `{ "messages": [{ "id", "mine", "body", "status", "notice", "createdAt" }] }`. Blocked messages are returned only to their sender.
POST body `{ "body": string (1 to 1000) }`. 200 `{ "id", "status": "delivered" | "blocked" | "held_for_review", "notice": string | null }`. A blocked message is a 200 with `status: "blocked"` and an explanation in `notice`; the web UI shows it as an error.
Errors: `not_found`, `chat_closed` (409), `rate_limited`.

### `POST /api/v1/bookings/{id}/rating`
Customer or assigned worker, after completion. Body `{ "score": 1-5, "comment": string? (max 500) }`.
200 `{ "id", "status": "visible" | "pending_review" }`. Errors: `not_found`, `not_completed` (409), `already_rated` (409).

## 5. Reports and worker

### `POST /api/v1/reports`
Signed in. Body `{ "entityType": "worker_profile" | "booking" | "chat_message" | "user", "entityId": uuid, "reason": "safety" | "inappropriate" | "off_platform_payment" | "harassment" | "fake_profile" | "other", "details": string? }`. 201 `{ "id" }`.

### `GET /api/v1/worker/jobs`
Worker role. 200 `{ "jobs": [{ "id", "ref", "status", "startsAt", "endsAt", "totalPaise", "serviceName", "serviceSlug", "cityName", "zoneName" }] }`.

### `GET /api/v1/admin/documents/{id}/file`
Roles with `worker.documents.read` (verifier, admin, and a worker for their own documents through RLS). Returns the decrypted file with `Cache-Control: no-store, private` and `Content-Disposition: inline`. Every view writes an audit entry.

## 6. Webhooks, jobs and health

### `POST /api/webhooks/payments/{provider}`
Gateway to platform. Raw body; signature in `x-saathi-signature` (sandbox): lowercase hex HMAC-SHA256 of the raw body with `SANDBOX_WEBHOOK_SECRET`. The route also reads `x-razorpay-signature`, but no Razorpay adapter exists, so that provider returns `unknown_provider`.
Body (sandbox):
```json
{ "id": "evt_sbx_...", "type": "payment.captured" | "payment.failed", "data": { "orderId": "order_sbx_...", "paymentId": "pay_sbx_...", "amountPaise": 100000 }, "createdAt": "ISO-8601" }
```
Responses: 200 `{ "status": "processed", "result": "captured_and_confirmed" | "already_captured" | "marked_failed" | "amount_mismatch" | "unknown_order" | "captured_needs_refund" }`; 200 `{ "status": "duplicate" }` for a replayed event id; 401 `{ "error": "bad_signature" }` (nothing stored); 400 `{ "error": "unknown_provider" | "bad_payload" }`.

### `GET /api/cron/run` (also `POST`)
Header `Authorization: Bearer <CRON_SECRET>` (compared in constant time). Runs the sweeps and returns their results, for example `{ "expirePaymentHolds": 0, "documentExpirySweep": { "expired": 0, "suspended": 0 }, "dispatchNotifications": { "sent": 0, "considered": 0 } }`. 401 otherwise.

### `GET /api/health`
Public. 200 `{ "ok": true, "db": "up", "ms": number }` or 503 `{ "ok": false, "db": "down" }`.

### `GET /sitemap.xml` and `GET /robots.txt`
See [seo-plan.md](seo-plan.md).
