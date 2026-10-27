import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { bookings } from '../bookings/schema';
import { users } from '../identity/schema';

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id),
    senderUserId: uuid('sender_user_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    status: text('status').notNull(),
    blockReasons: text('block_reasons').array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('chat_messages_booking_idx').on(t.bookingId, t.createdAt),
    check('chat_messages_status_chk', sql`${t.status} in ('delivered','blocked','held_for_review')`),
    check('chat_messages_len_chk', sql`char_length(${t.body}) between 1 and 1000`),
  ],
);

export const moderationFlags = pgTable(
  'moderation_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    userId: uuid('user_id'),
    reasons: text('reasons').array().notNull(),
    severity: text('severity').notNull(),
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedBy: uuid('resolved_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    index('moderation_flags_status_idx').on(t.status, t.createdAt),
    check('moderation_flags_severity_chk', sql`${t.severity} in ('block','review')`),
    check('moderation_flags_status_chk', sql`${t.status} in ('open','resolved')`),
  ],
);

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterUserId: uuid('reporter_user_id')
      .notNull()
      .references(() => users.id),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    reason: text('reason').notNull(),
    details: text('details'),
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('reports_entity_chk', sql`${t.entityType} in ('worker_profile','booking','chat_message','user')`),
    check('reports_status_chk', sql`${t.status} in ('open','reviewing','closed')`),
  ],
);
