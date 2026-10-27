import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { bookings } from '../bookings/schema';

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id),
    provider: text('provider').notNull(),
    mode: text('mode').notNull(),
    providerOrderId: text('provider_order_id').notNull(),
    providerPaymentId: text('provider_payment_id'),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    status: text('status').notNull().default('created'),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('payments_order_uq').on(t.provider, t.providerOrderId),
    uniqueIndex('payments_payment_uq').on(t.provider, t.providerPaymentId),
    index('payments_booking_idx').on(t.bookingId),
    check('payments_mode_chk', sql`${t.mode} in ('sandbox','live')`),
    check('payments_status_chk', sql`${t.status} in ('created','captured','failed','partially_refunded','refunded')`),
    check('payments_amount_chk', sql`${t.amountPaise} > 0`),
  ],
);

export const paymentWebhookEvents = pgTable(
  'payment_webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    eventType: text('event_type').notNull(),
    signatureValid: boolean('signature_valid').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    result: text('result'),
  },
  (t) => [uniqueIndex('payment_webhook_events_uq').on(t.provider, t.eventId)],
);

export const LEDGER_ACCOUNT_CODES = [
  'gateway_clearing',
  'customer_funds_held',
  'worker_payable',
  'commission_revenue',
  'platform_fee_revenue',
  'gst_output_payable',
  'tds_payable',
  'refunds_payable',
  'cancellation_fee_revenue',
  'payout_clearing',
] as const;
export type LedgerAccountCode = (typeof LEDGER_ACCOUNT_CODES)[number];

export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').$type<LedgerAccountCode>().notNull(),
    kind: text('kind').notNull(),
    ownerType: text('owner_type'),
    ownerId: uuid('owner_id'),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ledger_accounts_uq').on(t.code, sql`coalesce(${t.ownerId}, '00000000-0000-0000-0000-000000000000'::uuid)`),
    check('ledger_accounts_kind_chk', sql`${t.kind} in ('asset','liability','revenue','expense')`),
  ],
);

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    bookingId: uuid('booking_id').references(() => bookings.id),
    paymentId: uuid('payment_id').references(() => payments.id),
    memo: text('memo').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
  },
  (t) => [
    uniqueIndex('journal_entries_idem_uq').on(t.idempotencyKey),
    index('journal_entries_booking_idx').on(t.bookingId),
    check(
      'journal_entries_kind_chk',
      sql`${t.kind} in ('capture','completion','cancellation','refund','payout','adjustment')`,
    ),
  ],
);

/** Balance per journal is enforced by a deferred constraint trigger in drizzle/0001_security.sql. */
export const ledgerLines = pgTable(
  'ledger_lines',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    journalId: uuid('journal_id')
      .notNull()
      .references(() => journalEntries.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => ledgerAccounts.id),
    debitPaise: bigint('debit_paise', { mode: 'number' }).notNull().default(0),
    creditPaise: bigint('credit_paise', { mode: 'number' }).notNull().default(0),
    lineCode: text('line_code').notNull(),
  },
  (t) => [
    index('ledger_lines_account_idx').on(t.accountId),
    index('ledger_lines_journal_idx').on(t.journalId),
    check(
      'ledger_lines_one_side_chk',
      sql`(${t.debitPaise} > 0 and ${t.creditPaise} = 0) or (${t.creditPaise} > 0 and ${t.debitPaise} = 0)`,
    ),
  ],
);
