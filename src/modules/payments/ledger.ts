import { and, eq, sql } from 'drizzle-orm';
import { journalEntries, ledgerAccounts, ledgerLines, type LedgerAccountCode } from './schema';
import type { Tx } from '@/platform/db/client';

/**
 * Double-entry ledger (M13). The ledger is the source of truth for money; there is no balance
 * column anywhere. Journals are idempotent by key and must balance (deferred DB trigger).
 * Callers must run these inside asSystem(): only the system context may post.
 */
const ACCOUNT_KIND: Record<LedgerAccountCode, 'asset' | 'liability' | 'revenue' | 'expense'> = {
  gateway_clearing: 'asset',
  customer_funds_held: 'liability',
  worker_payable: 'liability',
  commission_revenue: 'revenue',
  platform_fee_revenue: 'revenue',
  gst_output_payable: 'liability',
  tds_payable: 'liability',
  refunds_payable: 'liability',
  cancellation_fee_revenue: 'revenue',
  payout_clearing: 'asset',
};

export async function ensureAccount(tx: Tx, code: LedgerAccountCode, owner?: { type: string; id: string }) {
  const ownerId = owner?.id ?? null;
  const existing = await tx
    .select({ id: ledgerAccounts.id })
    .from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.code, code), ownerId ? eq(ledgerAccounts.ownerId, ownerId) : sql`${ledgerAccounts.ownerId} is null`))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [row] = await tx
    .insert(ledgerAccounts)
    .values({ code, kind: ACCOUNT_KIND[code], ownerType: owner?.type ?? null, ownerId, name: owner ? `${code}:${owner.id}` : code })
    .onConflictDoNothing()
    .returning({ id: ledgerAccounts.id });
  if (row) return row.id;
  const [again] = await tx
    .select({ id: ledgerAccounts.id })
    .from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.code, code), ownerId ? eq(ledgerAccounts.ownerId, ownerId) : sql`${ledgerAccounts.ownerId} is null`));
  return again!.id;
}

export interface JournalLineInput {
  account: LedgerAccountCode;
  owner?: { type: string; id: string };
  debitPaise?: number;
  creditPaise?: number;
  lineCode: string;
}

/** Posts a balanced journal once per idempotency key. Returns { created: false } on replay. */
export async function postJournal(
  tx: Tx,
  j: {
    kind: 'capture' | 'completion' | 'cancellation' | 'refund' | 'payout' | 'adjustment';
    bookingId?: string;
    paymentId?: string;
    memo: string;
    idempotencyKey: string;
    createdBy: string;
    lines: JournalLineInput[];
  },
) {
  const debits = j.lines.reduce((s, l) => s + (l.debitPaise ?? 0), 0);
  const credits = j.lines.reduce((s, l) => s + (l.creditPaise ?? 0), 0);
  if (debits !== credits || debits <= 0) throw new Error(`journal ${j.idempotencyKey} does not balance (${debits}/${credits})`);

  const [entry] = await tx
    .insert(journalEntries)
    .values({
      kind: j.kind,
      bookingId: j.bookingId ?? null,
      paymentId: j.paymentId ?? null,
      memo: j.memo,
      idempotencyKey: j.idempotencyKey,
      createdBy: j.createdBy,
    })
    .onConflictDoNothing()
    .returning({ id: journalEntries.id });
  if (!entry) return { created: false as const };

  for (const l of j.lines) {
    if ((l.debitPaise ?? 0) === 0 && (l.creditPaise ?? 0) === 0) continue;
    const accountId = await ensureAccount(tx, l.account, l.owner);
    await tx.insert(ledgerLines).values({
      journalId: entry.id,
      accountId,
      debitPaise: l.debitPaise ?? 0,
      creditPaise: l.creditPaise ?? 0,
      lineCode: l.lineCode,
    });
  }
  return { created: true as const, journalId: entry.id };
}

/** Sum of a booking's journal lines by account code (for reconciliation and tests). */
export async function bookingLedgerSummary(tx: Tx, bookingId: string) {
  return tx.execute<{ kind: string; code: string; line_code: string; debit: number; credit: number }>(sql`
    select je.kind, la.code, ll.line_code, sum(ll.debit_paise)::bigint as debit, sum(ll.credit_paise)::bigint as credit
    from journal_entries je
    join ledger_lines ll on ll.journal_id = je.id
    join ledger_accounts la on la.id = ll.account_id
    where je.booking_id = ${bookingId}
    group by je.kind, la.code, ll.line_code
    order by je.kind, la.code, ll.line_code`);
}

/** Worker earnings = credits minus debits on their worker_payable account. */
export async function workerEarnings(tx: Tx, workerId: string) {
  const rows = await tx.execute<{ booking_id: string | null; ref: string | null; credited: number; created_at: Date }>(sql`
    select je.booking_id, b.ref, ll.credit_paise::bigint as credited, je.created_at
    from ledger_lines ll
    join ledger_accounts la on la.id = ll.account_id and la.code = 'worker_payable' and la.owner_id = ${workerId}
    join journal_entries je on je.id = ll.journal_id
    left join bookings b on b.id = je.booking_id
    where ll.credit_paise > 0
    order by je.created_at desc
    limit 100`);
  const total = rows.reduce((s, r) => s + Number(r.credited), 0);
  return { total, rows: rows.map((r) => ({ ...r, credited: Number(r.credited) })) };
}
