import type { Ctx } from '../db/client';
import { forbidden, unauthenticated } from '../errors';
import type { Role } from '../../modules/identity/schema';

/**
 * Permission matrix from docs/roles-and-permissions.md section 2.
 * "Own" and "Org" scoping is applied in the service query and again by RLS.
 */
const MATRIX = {
  'catalog.read': ['customer', 'worker', 'verifier', 'ops', 'support', 'finance', 'admin', 'agency_admin', 'corporate_admin'],
  'catalog.manage': ['admin'],
  'config.manage': ['admin'],
  'worker.search': ['customer', 'verifier', 'ops', 'support', 'admin', 'agency_admin', 'corporate_admin'],
  'worker.profile.manage': ['worker', 'admin', 'agency_admin'],
  'worker.documents.upload': ['worker', 'admin', 'agency_admin'],
  'worker.documents.read': ['worker', 'verifier', 'admin'],
  'worker.verify': ['verifier', 'admin'],
  'worker.availability.manage': ['worker', 'ops', 'admin', 'agency_admin'],
  'booking.create': ['customer', 'ops', 'admin', 'corporate_admin'],
  'booking.read': ['customer', 'worker', 'ops', 'support', 'finance', 'admin', 'agency_admin', 'corporate_admin'],
  'booking.read_all': ['ops', 'support', 'finance', 'admin'],
  'booking.cancel': ['customer', 'worker', 'ops', 'admin', 'corporate_admin'],
  'booking.start_finish': ['worker'],
  'booking.mark_no_show': ['worker', 'ops', 'admin'],
  'chat.read_write': ['customer', 'worker', 'ops', 'support', 'admin'],
  'chat.moderate': ['verifier', 'ops', 'admin'],
  'rating.create': ['customer', 'worker'],
  'rating.moderate': ['ops', 'admin'],
  'report.create': ['customer', 'worker', 'ops', 'support', 'admin', 'agency_admin', 'corporate_admin'],
  'payment.read': ['customer', 'ops', 'support', 'finance', 'admin', 'corporate_admin'],
  'ledger.read': ['worker', 'finance', 'admin', 'agency_admin'],
  'ledger.read_all': ['finance', 'admin'],
  'user.roles.manage': ['admin'],
  'audit.read': ['admin'],
  'waitlist.read': ['ops', 'admin'],
  'waitlist.manage': ['ops', 'admin'],
  'customer.id.submit': ['customer'],
  'customer.id.review': ['verifier', 'admin'],
  'request.create': ['customer'],
  'request.manage': ['ops', 'admin'],
  'booking.assign': ['ops', 'admin'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof MATRIX;

export function can(ctx: Ctx, permission: Permission): boolean {
  if (ctx.roles.includes('system')) return true;
  const allowed = MATRIX[permission] as readonly string[];
  return ctx.roles.some((r) => allowed.includes(r));
}

export function requirePermission(ctx: Ctx, permission: Permission) {
  if (!ctx.userId && !ctx.roles.includes('system')) throw unauthenticated();
  if (!can(ctx, permission)) throw forbidden();
}

export const isStaff = (ctx: Ctx) =>
  ctx.roles.some((r) => r === 'admin' || r === 'ops' || r === 'verifier' || r === 'finance' || r === 'support');
