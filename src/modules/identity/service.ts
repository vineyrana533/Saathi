import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { consents, otpChallenges, sessions, userRoles, users, type Role, ROLES } from './schema';
import { asSystem, systemCtx, withDb, type Ctx } from '@/platform/db/client';
import { hashCode, numericCode, randomToken, safeEqualHex, sha256Hex } from '@/platform/crypto';
import { isDevTestPhone } from '@/platform/env';
import { AppError, invalid, unauthenticated } from '@/platform/errors';
import { enforceRateLimit, LIMITS } from '@/platform/rate-limit';
import { normaliseIndianMobile } from '@/platform/auth/phone';
import { smsSender } from '@/platform/adapters/sms';
import { audit } from '@/platform/audit';
import { requirePermission } from '@/platform/auth/permissions';

export const OTP_TTL_SECONDS = 300;
export const OTP_MAX_ATTEMPTS = 5;
export const SESSION_TTL_DAYS = 30;
export const DEV_FIXED_OTP = '123456';

/** Versions of documents users accept. Text needs legal sign-off (decisions.md L-08). */
export const CONSENT_VERSIONS = {
  code_of_conduct: '2026-10-27-draft',
  terms_and_privacy: '2026-10-27-draft',
} as const;
export type ConsentPurpose = keyof typeof CONSENT_VERSIONS;

export async function requestLoginOtp(input: { phone: string; ip: string }) {
  const phone = normaliseIndianMobile(input.phone);
  await enforceRateLimit(`otp:req:phone:${phone}`, LIMITS.otpRequestPerPhone);
  await enforceRateLimit(`otp:req:ip:${input.ip}`, LIMITS.otpRequestPerIp);

  const code = isDevTestPhone(phone) ? DEV_FIXED_OTP : numericCode(6);
  await withDb(systemCtx(), async (tx) => {
    await tx.insert(otpChallenges).values({
      phoneE164: phone,
      purpose: 'login',
      codeHash: hashCode(`login:${phone}`, code),
      expiresAt: sql`now() + make_interval(secs => ${OTP_TTL_SECONDS})`,
    });
  });
  await smsSender().sendOtp(phone, code);
  return { phone, expiresInSeconds: OTP_TTL_SECONDS, sandbox: smsSender().sandbox };
}

export interface SessionUser {
  userId: string;
  roles: Role[];
  displayName: string | null;
  phoneE164: string;
}

/**
 * Verifies a login OTP. Wrong codes are counted and committed before the error is returned,
 * so attempts cannot be reset by the rollback of a failed request.
 */
export async function verifyLoginOtp(input: { phone: string; code: string; userAgent?: string | null }) {
  const phone = normaliseIndianMobile(input.phone);
  if (!/^\d{6}$/.test(input.code)) throw invalid('invalid_code', 'Enter the 6-digit code');
  await enforceRateLimit(`otp:verify:phone:${phone}`, LIMITS.otpVerifyPerPhone);

  const outcome = await withDb(systemCtx(), async (tx) => {
    const [challenge] = await tx
      .select()
      .from(otpChallenges)
      .where(and(eq(otpChallenges.phoneE164, phone), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, sql`now()`)))
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1)
      .for('update');
    if (!challenge) return { ok: false as const, reason: 'expired' as const };
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) return { ok: false as const, reason: 'locked' as const };
    if (!safeEqualHex(challenge.codeHash, hashCode(`login:${phone}`, input.code))) {
      await tx.update(otpChallenges).set({ attempts: challenge.attempts + 1 }).where(eq(otpChallenges.id, challenge.id));
      return { ok: false as const, reason: 'wrong' as const };
    }
    await tx.update(otpChallenges).set({ consumedAt: sql`now()` }).where(eq(otpChallenges.id, challenge.id));

    let [user] = await tx.select().from(users).where(eq(users.phoneE164, phone)).limit(1);
    let isNew = false;
    if (!user) {
      [user] = await tx.insert(users).values({ phoneE164: phone, phoneVerifiedAt: sql`now()` }).returning();
      await tx.insert(userRoles).values({ userId: user!.id, role: 'customer' });
      isNew = true;
    } else if (!user.phoneVerifiedAt) {
      await tx.update(users).set({ phoneVerifiedAt: sql`now()` }).where(eq(users.id, user.id));
    }
    if (!user) throw new Error('user upsert failed');
    if (user.status !== 'active') return { ok: false as const, reason: 'suspended' as const };

    const token = randomToken();
    await tx.insert(sessions).values({
      userId: user.id,
      tokenHash: sha256Hex(token),
      expiresAt: sql`now() + make_interval(days => ${SESSION_TTL_DAYS})`,
      userAgent: input.userAgent?.slice(0, 200) ?? null,
    });
    await audit(tx, { ...systemCtx(), userId: user.id }, isNew ? 'user.signup' : 'user.login', 'user', user.id);
    return { ok: true as const, token, userId: user.id, isNew };
  });

  if (!outcome.ok) {
    const messages = {
      expired: 'That code has expired. Request a new one.',
      locked: 'Too many wrong attempts. Request a new code.',
      wrong: 'That code is not right. Check the SMS and try again.',
      suspended: 'This account is suspended. Contact support.',
    } as const;
    throw new AppError(`otp_${outcome.reason}`, messages[outcome.reason], outcome.reason === 'suspended' ? 403 : 422);
  }
  return outcome;
}

export async function resolveSession(token: string | null | undefined): Promise<SessionUser | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  return withDb(systemCtx(), async (tx) => {
    const rows = await tx
      .select({ userId: users.id, displayName: users.displayName, phoneE164: users.phoneE164, sessionId: sessions.id, lastSeenAt: sessions.lastSeenAt })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, sha256Hex(token)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, sql`now()`),
          eq(users.status, 'active'),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const roles = await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, row.userId));
    if (Date.now() - row.lastSeenAt.getTime() > 15 * 60_000) {
      await tx.update(sessions).set({ lastSeenAt: sql`now()` }).where(eq(sessions.id, row.sessionId));
    }
    return {
      userId: row.userId,
      displayName: row.displayName,
      phoneE164: row.phoneE164,
      roles: [...new Set(roles.map((r) => r.role))],
    };
  });
}

export async function revokeSession(token: string) {
  await withDb(systemCtx(), (tx) =>
    tx.update(sessions).set({ revokedAt: sql`now()` }).where(eq(sessions.tokenHash, sha256Hex(token))),
  );
}

export const profileInput = z.object({
  displayName: z.string().trim().min(2, 'Enter your name').max(60),
  email: z.union([z.string().trim().email('Enter a valid email'), z.literal('')]).optional(),
  gender: z.enum(['female', 'male', 'non_binary', 'prefer_not_to_say', '']).optional(),
});

export async function updateMyProfile(ctx: Ctx, input: z.infer<typeof profileInput>) {
  if (!ctx.userId) throw unauthenticated();
  const data = profileInput.parse(input);
  await withDb(ctx, async (tx) => {
    await tx
      .update(users)
      .set({ displayName: data.displayName, email: data.email || null, gender: data.gender || null, updatedAt: sql`now()` })
      .where(eq(users.id, ctx.userId!));
    await audit(tx, ctx, 'user.profile_updated', 'user', ctx.userId);
  });
}

export async function acceptConsent(ctx: Ctx, purpose: ConsentPurpose) {
  if (!ctx.userId) throw unauthenticated();
  await withDb(ctx, async (tx) => {
    const existing = await tx
      .select({ id: consents.id })
      .from(consents)
      .where(
        and(
          eq(consents.userId, ctx.userId!),
          eq(consents.purpose, purpose),
          eq(consents.version, CONSENT_VERSIONS[purpose]),
          isNull(consents.withdrawnAt),
        ),
      )
      .limit(1);
    if (existing.length) return;
    await tx.insert(consents).values({ userId: ctx.userId!, purpose, version: CONSENT_VERSIONS[purpose] });
    await audit(tx, ctx, 'consent.granted', 'user', ctx.userId, { purpose, version: CONSENT_VERSIONS[purpose] });
  });
}

export async function getMyAccount(ctx: Ctx) {
  if (!ctx.userId) throw unauthenticated();
  return withDb(ctx, async (tx) => {
    const [u] = await tx.select({ displayName: users.displayName, email: users.email, gender: users.gender, phoneE164: users.phoneE164 }).from(users).where(eq(users.id, ctx.userId!)).limit(1);
    return u ?? null;
  });
}

export async function hasCurrentConsent(ctx: Ctx, purpose: ConsentPurpose): Promise<boolean> {
  if (!ctx.userId) return false;
  return withDb(ctx, async (tx) => {
    const rows = await tx
      .select({ id: consents.id })
      .from(consents)
      .where(
        and(
          eq(consents.userId, ctx.userId!),
          eq(consents.purpose, purpose),
          eq(consents.version, CONSENT_VERSIONS[purpose]),
          isNull(consents.withdrawnAt),
        ),
      )
      .limit(1);
    return rows.length > 0;
  });
}

export async function grantRole(ctx: Ctx, input: { userId: string; role: Role }) {
  requirePermission(ctx, 'user.roles.manage');
  if (!ROLES.includes(input.role)) throw invalid('invalid_role', 'Unknown role');
  await withDb(ctx, async (tx) => {
    await tx
      .insert(userRoles)
      .values({ userId: input.userId, role: input.role, grantedBy: ctx.userId })
      .onConflictDoNothing();
    await audit(tx, ctx, 'user.role_granted', 'user', input.userId, { role: input.role });
  });
}

/** Adds the worker role to the current user (self-service worker sign-up). */
export async function addSelfWorkerRole(ctx: Ctx) {
  if (!ctx.userId) throw unauthenticated();
  await withDb(ctx, async (tx) => {
    await asSystem(tx, ctx, async () => {
      await tx.insert(userRoles).values({ userId: ctx.userId!, role: 'worker' }).onConflictDoNothing();
    });
    await audit(tx, ctx, 'user.worker_signup', 'user', ctx.userId);
  });
}

