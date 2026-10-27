import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, integer } from 'drizzle-orm/pg-core';

export const ROLES = [
  'customer',
  'worker',
  'admin',
  'ops',
  'verifier',
  'finance',
  'support',
  'agency_admin',
  'corporate_admin',
] as const;
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES: Role[] = ['admin', 'ops', 'verifier', 'finance', 'support'];

export const organisations = pgTable(
  'organisations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull().default('active'),
    gstin: text('gstin'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('organisations_kind_chk', sql`${t.kind} in ('platform','agency','corporate')`),
    check('organisations_status_chk', sql`${t.status} in ('active','suspended')`),
  ],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phoneE164: text('phone_e164').notNull(),
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
    displayName: text('display_name'),
    email: text('email'),
    /** Optional, self-declared; used only to honour workers' customer-gender preferences. */
    gender: text('gender'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_phone_uq').on(t.phoneE164),
    check('users_gender_chk', sql`${t.gender} is null or ${t.gender} in ('female','male','non_binary','prefer_not_to_say')`),
    check('users_status_chk', sql`${t.status} in ('active','suspended','deleted')`),
    check('users_phone_chk', sql`${t.phoneE164} ~ '^\\+91[6-9][0-9]{9}$'`),
  ],
);

export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role').$type<Role>().notNull(),
    organisationId: uuid('organisation_id').references(() => organisations.id),
    grantedBy: uuid('granted_by').references(() => users.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('user_roles_uq').on(t.userId, t.role, sql`coalesce(${t.organisationId}, '00000000-0000-0000-0000-000000000000'::uuid)`),
    check(
      'user_roles_role_chk',
      sql`${t.role} in ('customer','worker','admin','ops','verifier','finance','support','agency_admin','corporate_admin')`,
    ),
  ],
);

export const organisationMembers = pgTable(
  'organisation_members',
  {
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    memberRole: text('member_role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.organisationId, t.userId] })],
);

export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phoneE164: text('phone_e164').notNull(),
    purpose: text('purpose').notNull().default('login'),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('otp_challenges_phone_idx').on(t.phoneE164, t.createdAt)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    userAgent: text('user_agent'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('sessions_token_uq').on(t.tokenHash), index('sessions_user_idx').on(t.userId)],
);

export const consents = pgTable(
  'consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    purpose: text('purpose').notNull(),
    version: text('version').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  },
  (t) => [index('consents_user_idx').on(t.userId, t.purpose)],
);
