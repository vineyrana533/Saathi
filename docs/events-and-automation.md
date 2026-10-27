# Events and automation

Status: Implemented for Milestone 1 (booking events, audit log, notification outbox, three sweeps). CRM automation is Milestone 4 and later. Last updated 27 October 2026.

There is no message broker. State changes write rows in the same database transaction as the change itself, so an event can never exist without its change, or the other way round.

## 1. Booking events (`booking_events`)

One row per status change, with `from_status`, `to_status`, `actor_role`, `actor_user_id` and `data`. Shown as the timeline on the customer, worker and admin booking pages.

| Change | Written by | Actor role | Data |
|---|---|---|---|
| (none) to `pending_payment` | `createBooking` | `customer` | `workerId`, `totalPaise` |
| `pending_payment` to `expired` | `expireStaleHolds` (sweep or inside a later booking for the same worker) | `system` | `reason: payment_hold_timeout` |
| `pending_payment` to `confirmed` | `confirmBookingAfterCapture` (payment webhook) | `system` | |
| `confirmed` to `in_progress` | `startJob` | `worker` | |
| `in_progress` to `completed` | `finishJob` | `worker` | |
| `pending_payment` or `confirmed` to `cancelled` | `cancelBooking` | `customer`, `worker` or `staff` | `reason`, `feePaise`, `band`, `feltUnsafe` |

The database trigger `bookings_status_guard` rejects any status change not in the allowed list from [booking-lifecycle.md](booking-lifecycle.md), whoever makes it.

## 2. Audit log (`audit_log`)

Append-only (a trigger blocks UPDATE and DELETE). Each entry has the actor, their roles, the request id, the entity and redacted data. Only admins can read it.

| Action | Entity | Where |
|---|---|---|
| `user.signup`, `user.login` | user | `verifyLoginOtp` |
| `user.profile_updated` | user | `updateMyProfile` |
| `consent.granted` | user | `acceptConsent` (purpose and version) |
| `user.role_granted` | user | `grantRole` |
| `user.worker_signup` | user | `addSelfWorkerRole` |
| `worker.registered`, `worker.profile_updated` | worker | `saveWorkerProfile` |
| `worker.document_uploaded` | worker_document | `uploadDocument` (records consent) |
| `worker.document_approved`, `worker.document_rejected` | worker_document | `reviewDocument` |
| `worker.document_viewed` | worker_document | `readDocumentFile` (every view of a file) |
| `worker.document_expired` | worker_document | `documentExpirySweep` |
| `worker.service_applied` | worker | `applyForService` |
| `worker.service_approved`, `worker.service_rejected` | worker | `reviewServiceApplication` |
| `worker.activated` | worker | `activateWorker` |
| `worker.hours_updated`, `worker.time_off_added` | worker | availability functions |
| `catalog.pricing_updated` | service_city | `updateServiceCityPricing` (old and new config, new version) |
| `catalog.service_city_status` | service_city | `setServiceCityStatus` |
| `catalog.service_config_updated` | service | `updateServiceConfig` |
| `booking.created` | booking | `createBooking` |
| `booking.start_code_wrong`, `booking.end_code_wrong` | booking | `startJob`, `finishJob` (attempt count) |
| `booking.started`, `booking.completed` | booking | `startJob`, `finishJob` |
| `booking.cancelled` | booking | `cancelBooking` |
| `payment.captured` | payment | webhook processing |
| `payment.amount_mismatch` | payment | webhook processing |
| `payment.captured_needs_refund` | payment | webhook processing |
| `chat.message_blocked`, `chat.message_held_for_review` | chat_message | `sendChatMessage` |
| `report.created` | reported entity | `createReport` |
| `rating.created` | booking | `rateBooking` |

## 3. Notifications (`notification_outbox`)

`enqueueNotification` inserts a row with a unique `idempotency_key` using `ON CONFLICT DO NOTHING`. If the same code path runs twice, the second insert is ignored, so a message is queued once and sent at most once.

| Template | Channel | Recipient | Idempotency key | Queued by |
|---|---|---|---|---|
| `booking_confirmed_customer` | sms | customer | `confirmed:customer:<bookingId>` | payment capture |
| `booking_confirmed_worker` | sms | assigned worker | `confirmed:worker:<bookingId>` | payment capture |
| `rate_your_booking` | in_app | customer | `rate:customer:<bookingId>` | job completion |
| `rate_your_customer` | in_app | worker | `rate:worker:<bookingId>` | job completion |
| `document_approved`, `document_rejected` | sms | worker | `doc-review:<documentId>` | document review |
| `document_expired` | sms | worker | `doc-expired:<documentId>` | expiry sweep |

Dispatch (`dispatchPending`) claims pending rows with `FOR UPDATE SKIP LOCKED`, sends SMS through the SMS adapter and marks rows `sent`. Other channels are logged as not delivered because no email, push or in-app inbox exists yet. A failing row is retried up to 5 times, then marked `failed`. With the `dev-log` adapter nothing reaches a phone. Message wording for templates is not written yet; it will need DLT-registered templates once an SMS vendor is chosen (decisions.md V-03).

## 4. Scheduled sweeps (`src/modules/jobs/service.ts`)

`runAllSweeps()` runs three idempotent sweeps in order and reports each result. A failure in one is logged and does not stop the others.

| Sweep | Effect |
|---|---|
| `expirePaymentHolds` | Marks `pending_payment` bookings past `hold_expires_at` as `expired`, releases their worker assignments and writes booking events. |
| `documentExpirySweep` | Marks approved documents past `expires_on` as `expired`. For each, suspends the worker's approval for any service that requires that document type (unless another valid one exists), queues a `document_expired` notification and writes an audit entry. Search already hides expired documents by date, so correctness does not depend on this running on time. |
| `dispatchNotifications` | Sends pending outbox rows as described above. |

How they run:

- `GET` or `POST /api/cron/run` with `Authorization: Bearer <CRON_SECRET>`. In production this is meant to be called by Vercel Cron; the cron schedule is not configured yet (no `vercel.json`), and per-minute schedules need a paid Vercel plan (decisions.md T-07).
- `pnpm jobs:run` runs the same function once from a terminal.

The `jobs` table (one-off jobs with a unique `dedupe_key`) exists in the schema, but nothing enqueues or processes rows in it yet. Milestone 2 and 3 work (quote expiry, safety check-ins, payouts) will use it.

## 5. Planned: CRM and follow-up automation (M15)

Not built. Planned for Milestone 4 as "basic CRM automations" (see [implementation-roadmap.md](implementation-roadmap.md)): lead and enquiry records with source, owner and status; incomplete-booking and pending-quote reminders; post-service feedback and repeat-booking reminders; reactivation; consent and channel preferences with opt-out; deduplication and retries. All of it will reuse the outbox above, so every automated message is logged and has an idempotency key. Waitlist entries (`waitlist_entries`) are the first CRM input already being collected.
