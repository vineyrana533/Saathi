# Milestone report: Milestone 2

Date: 28 October 2026. Scope: assisted matching and quotes, multi-person (team) bookings, and event and business staff as the first service that needs them. Built on the staging setup from Milestone 1 (Supabase Tokyo, Vercel, sandbox payments).

## 1. What was built

- **Requests (M07).** A customer asks for a quote from any service page: number of people, area, date, time, hours, the service's questions, address, details and an optional budget. Requests start at least 24 hours ahead. Each request gets a first-response deadline of 2 business hours (09:00 to 19:00 IST, Monday to Saturday), an owner, and a full status history. A database trigger rejects any status change outside the lifecycle.
- **Quotes (M08).** Ops prepare a draft (people, hours, price per person per hour, message, proposed people), then send it. A quote is valid for 48 hours, never later than an hour before the job. The customer can accept and pay, ask for changes (which creates a new version), or decline. Ops can withdraw a quote. Sent quotes cannot be edited and closed quotes never change (trigger).
- **Suggestions and manual dispatch (M09).** For a request, and for any empty place on a booking, ops see verified people who are approved for the service, work in the area and are free for the whole slot. These use the same eligibility query as customer search.
- **Team bookings (M07, M13).** Paying for an accepted quote confirms a booking for the whole team in the same transaction as the payment, with the proposed people who are still free assigned. Empty places are a partial fill. Ops see them on the overview and under "Places still to fill", and the customer sees "2 of 3 people confirmed". The job cannot start until every place is filled. Each person is paid the same per-person amount, and each can be rated separately. A worker who pulls out of a team booking frees only their own place.
- **Ops screens (M18).** Request queue (open, waiting for a first response, mine, all) with overdue deadlines highlighted; request page with owner, actions, quote builder, quote history and timeline; team section on the booking page; four new overview counts.
- **Customer screens (M06).** "Ask for a quote" on every service page in a live city; request form; request page with the quote, people lined up, accept and pay, ask for changes, decline and cancel; requests listed above bookings.

## 2. What was tested

| Check | Result |
|---|---|
| Type check | 0 errors |
| Lint | 0 problems |
| Production build | Succeeds |
| Vitest, real PostgreSQL 17 | 149 tests in 24 files, all pass |
| Milestone 2 exit criteria | All covered by `tests/integration/assisted-requests.test.ts` (6 tests) and unit tests for team pricing and business hours |
| Manual browser pass (local) | Customer request for 3 event staff; staff takes it, proposes 2 people at ₹280 an hour, saves and sends the quote; customer accepts and pays; booking confirmed with 2 of 3; staff fills the third place from "Places still to fill" |

The exit criteria and the tests that check them:

- **A request moves through every status with audit history.** Submitted, in review, sourcing, quoted, back to review after a change request, quoted again, then accepted. Each step has its actor and audit entries. Declined, cancelled, expired and reopened requests are covered too.
- **An accepted quote becomes a confirmed multi-worker booking.** It is paid through the sandbox gateway and confirmed with its team.
- **Partial fill is visible to ops.** It shows in the bookings list filter, and the job cannot start until ops fill the place.
- **Quote expiry.** An expired quote is refused at accept, the request expires, ops reopen it, and the sweep expires quotes nobody looked at.
- **Multi-worker overlap.** Busy people are not suggested and cannot be proposed. Someone booked elsewhere between quote and accept leaves an empty place instead of a double booking. Ops cannot assign them either.
- **Integrity and privacy.** The database refuses edits to a final quote, illegal request transitions and deleting history. Other customers cannot see a request, and customers never see drafts.

Bugs found and fixed while building: the time check for overdue responses ran during page rendering; the "Assign" buttons were not distinguishable to screen readers.

## 3. Not done yet

- Workers do not see job offers or accept and decline jobs (Milestone 3, M10). Ops confirm people by phone before proposing them.
- Making a team smaller after payment needs partial refunds (Milestone 3).
- Start and end codes are one per booking; per-person check-in comes with safety check-ins (Milestone 3).
- No API endpoints for requests yet (the web app uses server actions). Needed before a native app.
- Reminders for quotes about to expire, and SMS text for "quote ready", wait for the SMS vendor (V-03). Messages are queued in the outbox and logged.

## 4. Risks and limitations

- On Vercel Hobby the sweep runs once a day. Quote and request expiry is also checked before every read and action, so nothing stale can be accepted, but the ops list may show an expired quote as sent until someone opens it.
- First-response deadlines assume ops work 09:00 to 19:00, Monday to Saturday (P-10, pending sign-off).
- Quote prices are typed by ops per person per hour. Nothing yet stops a quote below cost; review before real customers.
- All earlier limits still apply: sandbox payments only, placeholder prices, open legal items for care services.

## 5. Decisions needed

- Confirm business hours and the 2-hour first response (P-10).
- Confirm team size limits per service (T-33): event staff 50, driver 10, errands 5, domestic help 3, care services 1.

Details in [decisions.md](decisions.md) section 10.

## 6. Tracker

See [module-status.md](module-status.md).
