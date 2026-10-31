import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRequestForOps, suggestWorkersForRequest } from '@/modules/requests/assisted';
import { formatInr } from '@/modules/pricing/engine';
import { can } from '@/platform/auth/permissions';
import { isAppError } from '@/platform/errors';
import { formatIst } from '@/platform/time';
import { ActionForm, SubmitButton } from '@/ui/action-form';
import { Field, Input, Notice, Pill, PriceTable, Select, STATUS_TONE, Textarea } from '@/ui/primitives';
import { requireAnyRole, STAFF } from '../../../_lib/session';
import {
  cancelRequestStaffAction,
  claimRequestAction,
  reopenRequestAction,
  saveQuoteDraftAction,
  sendQuoteAction,
  setRequestStageAction,
  withdrawQuoteAction,
} from '../../actions';

const OPEN = ['submitted', 'in_review', 'sourcing', 'quoted'];
const WORKING = ['submitted', 'in_review', 'sourcing'];

export default async function AdminRequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireAnyRole(STAFF, `/admin/requests/${id}`);
  if (!can(ctx, 'request.manage')) return <Notice tone="warning">Your role cannot work on requests. Ask an admin for the ops role.</Notice>;
  let r;
  try {
    r = await getRequestForOps(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.status === 404) notFound();
    throw e;
  }
  const open = OPEN.includes(r.status);
  const suggestions = open ? await suggestWorkersForRequest(ctx, id) : [];
  const draft = r.quotes.find((q) => q.status === 'draft') ?? null;
  const sent = r.quotes.find((q) => q.status === 'sent') ?? null;
  const proposed = new Set(draft?.proposedWorkerIds ?? []);
  const durations: number[] = [];
  if (r.durationLimits) for (let m = r.durationLimits.min; m <= r.durationLimits.max; m += r.durationLimits.step) durations.push(m);
  const mine = r.ownerUserId === ctx.userId;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-h1 font-bold">{r.ref}</h1>
        <Pill tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status.replace(/_/g, ' ')}</Pill>
      </div>
      <p className="mt-2 text-ink-2">
        {r.serviceName}, {r.workersNeeded} {r.workersNeeded === 1 ? 'person' : 'people'} · {formatIst(r.startsAt)} to {formatIst(r.endsAt, { timeStyle: 'short' })} · {r.zoneName},{' '}
        {r.cityName}
      </p>

      <div className="mt-8 grid gap-10 lg:grid-cols-12">
        <div className="flex flex-col gap-10 lg:col-span-7">
          <dl className="border-t border-ink">
            {[
              ['Customer', <span key="c">{r.customer.name} · <a className="link" href={`tel:${r.customer.phoneE164}`}>{r.customer.phoneE164}</a></span>],
              ['Owner', r.ownerName ?? 'Nobody yet'],
              ['First response', r.firstRespondedAt ? `Done ${formatIst(r.firstRespondedAt)}` : `Due ${formatIst(r.firstResponseDueAt)}${r.responseOverdue ? ' (overdue)' : ''}`],
              ['Address', `${r.addressLine}${r.landmark ? `, ${r.landmark}` : ''}`],
              ...r.answersDisplay.map((a) => [a.label, a.value] as const),
              ['Details', r.details || 'None'],
              ['Budget', r.budgetPaise != null ? formatInr(r.budgetPaise) : 'Not given'],
              ...(r.closedReason ? [['Closed because', r.closedReason.replace(/_/g, ' ')] as const] : []),
            ].map(([k, v]) => (
              <div key={String(k)} className="grid grid-cols-3 gap-4 border-b border-rule py-3">
                <dt className="text-ink-2">{k}</dt>
                <dd className="col-span-2 whitespace-pre-line break-words">{v}</dd>
              </div>
            ))}
          </dl>

          {r.booking && (
            <Notice tone={r.status === 'accepted' ? 'success' : 'info'} title={`Booking ${r.booking.ref}: ${r.booking.status.replace(/_/g, ' ')}`}>
              {r.bookingAssigned != null && (
                <p>
                  {r.bookingAssigned} of {r.workersNeeded} places filled.{' '}
                  <Link className="link font-semibold" href={`/admin/bookings/${r.booking.id}`}>
                    Open the booking to fill places
                  </Link>
                </p>
              )}
            </Notice>
          )}

          {(open || r.status === 'expired') && (
            <section aria-labelledby="actions-title">
              <h2 id="actions-title" className="font-display text-h3 font-semibold">
                Actions
              </h2>
              <div className="mt-3 flex flex-wrap items-start gap-3">
                {open && !mine && (
                  <ActionForm action={claimRequestAction} errorTitle="Could not take it">
                    <input type="hidden" name="requestId" value={r.id} />
                    <SubmitButton>{r.ownerUserId ? 'Take over this request' : 'Take this request'}</SubmitButton>
                  </ActionForm>
                )}
                {WORKING.includes(r.status) && r.status !== 'sourcing' && (
                  <ActionForm action={setRequestStageAction} errorTitle="Could not update">
                    <input type="hidden" name="requestId" value={r.id} />
                    <input type="hidden" name="to" value="sourcing" />
                    <SubmitButton variant="secondary">Mark as finding people</SubmitButton>
                  </ActionForm>
                )}
                {r.status === 'sourcing' && (
                  <ActionForm action={setRequestStageAction} errorTitle="Could not update">
                    <input type="hidden" name="requestId" value={r.id} />
                    <input type="hidden" name="to" value="in_review" />
                    <SubmitButton variant="secondary">Back to review</SubmitButton>
                  </ActionForm>
                )}
                {r.status === 'expired' && (
                  <ActionForm action={reopenRequestAction} errorTitle="Could not reopen">
                    <input type="hidden" name="requestId" value={r.id} />
                    <SubmitButton>Reopen (customer still wants it)</SubmitButton>
                  </ActionForm>
                )}
              </div>
              {open && (
                <details className="mt-4">
                  <summary className="cursor-pointer font-semibold">Cancel the request</summary>
                  <ActionForm action={cancelRequestStaffAction} errorTitle="Could not cancel" className="mt-3">
                    <input type="hidden" name="requestId" value={r.id} />
                    <div className="flex flex-wrap gap-2">
                      <Input name="reason" placeholder="Reason the customer will see" aria-label="Cancellation reason" required className="max-w-md" />
                      <SubmitButton variant="danger">Cancel request</SubmitButton>
                    </div>
                  </ActionForm>
                </details>
              )}
            </section>
          )}

          {sent && (
            <section aria-labelledby="sent-title" className="border border-rule-strong bg-surface p-6">
              <h2 id="sent-title" className="font-display text-h3 font-semibold">
                Quote {sent.version} sent, waiting for the customer
              </h2>
              <p className="mt-1 text-small text-ink-2">
                Sent {sent.sentAt ? formatIst(sent.sentAt) : ''} · valid until {sent.expiresAt ? formatIst(sent.expiresAt) : ''}
              </p>
              <QuoteSummary q={sent} />
              <details className="mt-4">
                <summary className="cursor-pointer font-semibold">Withdraw this quote</summary>
                <ActionForm action={withdrawQuoteAction} errorTitle="Could not withdraw" className="mt-3">
                  <input type="hidden" name="quoteId" value={sent.id} />
                  <div className="flex flex-wrap gap-2">
                    <Input name="reason" placeholder="Reason" aria-label="Reason for withdrawing" required className="max-w-md" />
                    <SubmitButton variant="secondary">Withdraw</SubmitButton>
                  </div>
                </ActionForm>
              </details>
            </section>
          )}

          {draft && (
            <section aria-labelledby="draft-title" className="border border-rule-strong bg-surface p-6">
              <h2 id="draft-title" className="font-display text-h3 font-semibold">
                Draft quote {draft.version} (the customer cannot see it yet)
              </h2>
              <QuoteSummary q={draft} />
              <div className="mt-4 flex flex-wrap items-start gap-3">
                <ActionForm action={sendQuoteAction} errorTitle="Could not send">
                  <input type="hidden" name="quoteId" value={draft.id} />
                  <SubmitButton>Send to customer</SubmitButton>
                </ActionForm>
                <ActionForm action={withdrawQuoteAction} errorTitle="Could not discard">
                  <input type="hidden" name="quoteId" value={draft.id} />
                  <input type="hidden" name="reason" value="Draft discarded" />
                  <SubmitButton variant="secondary">Discard draft</SubmitButton>
                </ActionForm>
              </div>
            </section>
          )}

          {WORKING.includes(r.status) && (
            <section aria-labelledby="quote-form-title">
              <h2 id="quote-form-title" className="font-display text-h3 font-semibold">
                {draft ? 'Change the draft' : 'Prepare a quote'}
              </h2>
              <p className="mt-1 text-small text-ink-2">
                Price per person per hour; the customer total includes everyone. Pick people from the list below; any you leave out become empty places to fill after payment.
              </p>
              <ActionForm action={saveQuoteDraftAction} errorTitle="Could not save" className="mt-4">
                <input type="hidden" name="requestId" value={r.id} />
                <div className="grid gap-5 sm:grid-cols-3">
                  <Field id="f-workersCount" label="People">
                    <Input id="f-workersCount" name="workersCount" type="number" min={1} max={r.maxPeople} defaultValue={draft?.workersCount ?? r.workersNeeded} required />
                  </Field>
                  <Field id="f-durationMinutes" label="Hours">
                    <Select id="f-durationMinutes" name="durationMinutes" defaultValue={String(draft?.durationMinutes ?? r.durationMinutes)}>
                      {durations.map((d) => (
                        <option key={d} value={d}>
                          {d / 60}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field id="f-hourlyRateRupees" label="Rupees per person per hour">
                    <Input
                      id="f-hourlyRateRupees"
                      name="hourlyRateRupees"
                      type="number"
                      min={1}
                      defaultValue={Math.round((draft?.hourlyRatePaise ?? r.defaultHourlyRatePaise) / 100)}
                      required
                    />
                  </Field>
                </div>
                <Field id="f-messageToCustomer" label="Message to the customer (optional)">
                  <Textarea id="f-messageToCustomer" name="messageToCustomer" maxLength={500} defaultValue={draft?.messageToCustomer ?? ''} />
                </Field>
                <fieldset id="f-proposedWorkerIds">
                  <legend className="text-small font-semibold">
                    Free and eligible for this slot ({suggestions.length}), nearest first. Verified for this service, within their travel distance of {r.localityName ?? r.zoneName}, free for the whole time including travel.
                  </legend>
                  {suggestions.length === 0 ? (
                    <p className="mt-2 text-ink-2">Nobody matches yet. You can still quote and fill places after payment.</p>
                  ) : (
                    <ul className="mt-2 max-h-96 overflow-y-auto border-y border-rule">
                      {suggestions.map((w) => (
                        <li key={w.id} className="border-b border-rule last:border-b-0">
                          <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2">
                            <input type="checkbox" name="proposedWorkerIds" value={w.id} defaultChecked={proposed.has(w.id)} className="size-5 accent-ink" />
                            <span>
                              <span className="font-semibold">{w.displayName}</span>
                              <span className="text-small text-ink-2">
                                {' '}
                                · {w.distanceKm != null ? `${w.distanceKm} km away · ` : ''}{w.gender ?? 'gender not given'} · {w.yearsExperience} years · {w.languages.join(', ')} ·{' '}
                                {w.ratingCount ? `${(w.ratingAvgX100 / 100).toFixed(1)} from ${w.ratingCount}` : 'new'}
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </fieldset>
                <div>
                  <SubmitButton>{draft ? 'Update draft' : 'Save draft'}</SubmitButton>
                </div>
              </ActionForm>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-10 lg:col-span-5">
          {r.quotes.length > 0 && (
            <div>
              <h2 className="mb-3 font-display text-h4 font-semibold">Quotes</h2>
              <ul className="border-t border-rule">
                {r.quotes.map((q) => (
                  <li key={q.id} className="border-b border-rule py-3">
                    <p className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        Version {q.version}: {q.workersCount} × {formatInr(q.hourlyRatePaise)}/h, {formatInr(q.totalPaise)}
                      </span>
                      <Pill tone={STATUS_TONE[q.status] ?? 'neutral'}>{q.status.replace(/_/g, ' ')}</Pill>
                    </p>
                    {q.customerNote && <p className="mt-1 text-small text-ink-2">Customer: {q.customerNote}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h2 className="mb-4 font-display text-h4 font-semibold">History</h2>
            <ol className="border-l border-rule-strong pl-5">
              {r.events.map((e, i) => (
                <li key={i} className="pb-4">
                  <p className="font-semibold">
                    {e.from ? `${e.from.replace(/_/g, ' ')} → ` : ''}
                    {e.to.replace(/_/g, ' ')}
                  </p>
                  <p className="text-small text-ink-2">
                    {formatIst(e.at)} · {e.by}
                    {e.actorUserId ? `, ${r.actorNames[e.actorUserId] ?? 'staff'}` : ''}
                    {typeof e.data.note === 'string' && e.data.note ? ` · "${e.data.note}"` : ''}
                    {typeof e.data.reason === 'string' ? ` · ${e.data.reason.replace(/_/g, ' ')}` : ''}
                    {typeof e.data.owner === 'string' ? ` · owner ${r.actorNames[e.data.owner] ?? 'staff'}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </>
  );
}

function QuoteSummary({ q }: { q: { lines: { label: string; amountPaise: number }[]; totalPaise: number; perPersonNetPaise: number; proposed: { id: string; name: string }[]; workersCount: number; messageToCustomer: string | null } }) {
  return (
    <div className="mt-4">
      <PriceTable
        caption="Quote breakdown"
        lines={q.lines.map((l) => ({ label: l.label, amount: formatInr(l.amountPaise) }))}
        totalLabel="Customer pays"
        total={formatInr(q.totalPaise)}
      />
      <p className="mt-2 text-small text-ink-2">Each person earns {formatInr(q.perPersonNetPaise)} after commission and GST.</p>
      <p className="mt-2 text-small">
        People proposed: {q.proposed.length ? q.proposed.map((p) => p.name).join(', ') : 'none'}
        {q.workersCount > q.proposed.length ? ` (${q.workersCount - q.proposed.length} to fill after payment)` : ''}
      </p>
      {q.messageToCustomer && <p className="mt-2 whitespace-pre-line text-small">Message: {q.messageToCustomer}</p>}
    </div>
  );
}
