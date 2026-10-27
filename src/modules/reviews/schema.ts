import { sql } from 'drizzle-orm';
import { check, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { bookings } from '../bookings/schema';
import { users } from '../identity/schema';

export const ratings = pgTable(
  'ratings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id),
    raterUserId: uuid('rater_user_id')
      .notNull()
      .references(() => users.id),
    rateeUserId: uuid('ratee_user_id')
      .notNull()
      .references(() => users.id),
    direction: text('direction').notNull(),
    score: smallint('score').notNull(),
    comment: text('comment'),
    status: text('status').notNull().default('visible'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ratings_booking_direction_uq').on(t.bookingId, t.direction),
    check('ratings_direction_chk', sql`${t.direction} in ('customer_to_worker','worker_to_customer')`),
    check('ratings_score_chk', sql`${t.score} between 1 and 5`),
    check('ratings_status_chk', sql`${t.status} in ('visible','pending_review','hidden')`),
  ],
);
