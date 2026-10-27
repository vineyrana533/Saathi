# Payment gateway category approval request

**Draft, not sent. Needs internal sign-off before sending (decisions.md V-01).**

Purpose: get written confirmation from the payment gateway that Saathi's business model and each service category are an approved merchant category before any live payment. Live payments stay blocked in code until this is recorded (`PAYMENTS_LIVE_APPROVED` must be `true`, and `env()` refuses live mode in production otherwise).

Addressed to Razorpay as the primary gateway. To adapt it for Cashfree, change the addressee and product names (Razorpay Route becomes Cashfree Easy Split, RazorpayX Payouts becomes Cashfree Payouts) and keep the questions.

Placeholders in square brackets must be filled in. Nothing in this letter is a legal conclusion; regulatory points need legal/CA confirmation before sending.

---

**To:** Razorpay merchant onboarding and risk team
**From:** [Name, role], [COMPANY NAME AND REGISTRATION]
**Subject:** Request for written confirmation of merchant category approval: Saathi, a marketplace for verified people for everyday jobs (Delhi NCR)

Dear Razorpay team,

We are preparing to launch Saathi ([DOMAIN]), operated by [COMPANY NAME], [CIN or registration number], [registered address], GSTIN [GSTIN]. Before we apply for live payments, we would like written confirmation that our business model and each of our service categories is an approved merchant category, and guidance on the right setup.

**What Saathi does**

Saathi is an online marketplace in Delhi, Noida and Gurugram (Mumbai later) where customers book a verified individual for a specific, time-bound job. Customers pick a time, see only people who are verified and free, see the full price before paying, and pay through Saathi.

**How money moves**

1. The customer pays the full booking amount up front through the gateway when they confirm a booking.
2. Saathi holds the amount until the job is completed. The job starts and ends only when the worker enters one-time codes that only the customer holds.
3. After completion and a 48-hour dispute window, Saathi pays the worker weekly to their bank account or UPI ID, after deducting a platform commission (20% at launch) and any applicable taxes.
4. Cancellations follow a published policy: free more than 24 hours before the start, 50% between 24 and 2 hours, 100% under 2 hours. Refunds go back to the original payment method.
5. Typical ticket size: [₹X to ₹Y]. Expected monthly volume in the first six months: [number of transactions, GMV].

**Categories at launch**

1. **Personal driver** for the customer's own car, by the hour or day. Drivers hold a valid driving licence for the vehicle class. No vehicles are provided by Saathi.
2. **Event and business staff**: hosts, ushers, registration desk staff, helpers and promoters for events and offices.
3. **Errands and appointment assistance**: standing in queues, document runs, shopping help, and accompanying an adult to an appointment for non-medical help only.

**Category planned later (please assess separately)**

4. **Social companion (platonic only)**: company for shopping, coffee, a movie, an event or sightseeing. This category is built but switched off. It will only launch after an internal safety review. Its rules are strict: public venues only, daytime and evening hours (9 am to 10 pm), maximum 4 hours, customers must complete ID verification, and any sexual, intimate, romantic, dating, escort-style, massage or physical-contact service is prohibited and blocked. We understand services of this kind can be restricted, so we want your written position before we enable it.

**What we do not offer**

No sexual or intimate services of any kind, no massage or physical-contact services, no therapy or medical services, no overnight or private-space companion bookings, no bookings involving anyone under 18, and no services that need a licence the worker does not hold.

**Trust and safety controls**

- Phone OTP for every account.
- Worker identity checked with explicit consent (we store only a masked number and a provider reference, never a full Aadhaar number), a police verification certificate, and service-specific documents such as a driving licence, with expiry tracking that removes a worker from search the day a document expires.
- Per-service approval of each worker.
- Start and end codes for every job.
- In-app chat that blocks phone numbers, emails, UPI IDs and payment links to stop off-platform payments.
- A prohibited-content keyword filter on profiles, booking notes and chat.
- A one-tap report button on every profile and booking, an audit log, and account suspension for violations.
- Planned before public launch: SOS, live location sharing, masked calling and incident handling with response targets.

**Our questions**

1. Are categories 1, 2 and 3 approved for our account? Which MCC would you assign?
2. Is category 4 (platonic social companion, public venues only, as described above) permitted? If yes, on what conditions? If not, please say so in writing so we keep it disabled.
3. Does any part of our model fall under your prohibited or restricted business list?
4. For holding funds until completion and paying workers weekly, should we use Razorpay Route (linked accounts) or RazorpayX Payouts? What KYC do you need for each worker or linked account?
5. Is there a limit on how long collected funds can be held before settlement or payout?
6. What documents do you need from us beyond standard merchant KYC (for example our terms of service, privacy notice, cancellation and refund policy, and grievance officer details)?
7. Are there conditions on refunds for partial cancellation fees?
8. Can we keep a sandbox or test account while approval is pending?

We would be grateful for a written reply we can keep on record. Happy to share our staging site, policies or a walkthrough.

Regards,
[Name]
[Role], [COMPANY NAME]
[SUPPORT EMAIL AND PHONE]
[DOMAIN]

---

## Internal checklist before sending

- [ ] Fill every placeholder (company, registration, GSTIN, domain, contact, volumes).
- [ ] Legal review of the description of categories and of the fund-holding model (escrow-like holding may have regulatory implications: Needs legal/CA confirmation).
- [ ] Attach drafts of terms of service, privacy notice, cancellation and refund policy, and code of conduct.
- [ ] Internal sign-off recorded in decisions.md V-01.
- [ ] After the reply: record the outcome per category in decisions.md, and only then build the Razorpay adapter and set `PAYMENTS_LIVE_APPROVED`.
