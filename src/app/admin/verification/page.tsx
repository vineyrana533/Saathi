import { verificationQueue } from '@/modules/workers/service';
import { idCheckQueue } from '@/modules/identity/id-check';
import { can } from '@/platform/auth/permissions';
import { formatIst } from '@/platform/time';
import { ActionForm, SubmitButton } from '@/ui/action-form';
import { EmptyState, Input, Notice, Pill } from '@/ui/primitives';
import { requireAnyRole, STAFF } from '../../_lib/session';
import { activateWorkerAction, reviewApplicationAction, reviewDocumentAction, reviewIdCheckAction } from '../actions';

const DOC_LABEL: Record<string, string> = {
  driving_licence: 'Driving licence',
  police_certificate: 'Police certificate',
  id_proof: 'ID document',
  selfie: 'Selfie',
  profile_photo: 'Profile photo',
  caregiver_training: 'Caregiver training certificate',
  first_aid_certificate: 'First aid certificate',
  nursing_registration: 'Nursing council registration',
  medical_qualification: 'Nursing or medical qualification',
};

const ID_LABEL: Record<string, string> = {
  aadhaar: 'Aadhaar',
  pan: 'PAN',
  voter_id: 'Voter ID',
  passport: 'Passport',
  driving_licence: 'Driving licence',
};

export default async function VerificationPage() {
  const { ctx } = await requireAnyRole(STAFF, '/admin/verification');
  if (!can(ctx, 'worker.verify')) return <Notice tone="warning">Your role cannot review verification. Ask an admin for the verifier role.</Notice>;
  const q = await verificationQueue(ctx);
  const ids = await idCheckQueue(ctx);
  return (
    <>
      <h1 className="font-display text-h1 font-bold">Verification</h1>
      <Notice tone="warning" title="Manual KYC (sandbox)">
        No KYC or police verification vendor is connected yet. Check each document by eye against the details entered. Every file you open is logged.
      </Notice>

      <section className="mt-10" aria-labelledby="docs">
        <h2 id="docs" className="font-display text-h2 font-bold">
          Documents ({q.docs.length})
        </h2>
        {q.docs.length === 0 ? (
          <EmptyState title="No documents waiting" body="New uploads appear here." />
        ) : (
          <ul className="mt-4 border-t border-ink">
            {q.docs.map((d) => (
              <li key={d.id} className="grid gap-4 border-b border-rule py-5 lg:grid-cols-12">
                <div className="lg:col-span-5">
                  <p className="font-semibold">
                    {DOC_LABEL[d.docType]}: {d.workerName}
                  </p>
                  <p className="text-small text-ink-2">
                    {d.numberMasked ?? 'No number'} · {d.issuedOn ? `issued ${d.issuedOn} · ` : ''}
                    {d.expiresOn ? `expires ${d.expiresOn} · ` : ''}
                    {Array.isArray((d.attributes as { vehicle_classes?: string[] }).vehicle_classes) ? `classes ${(d.attributes as { vehicle_classes: string[] }).vehicle_classes.join(', ')} · ` : ''}
                    uploaded {formatIst(d.createdAt)}
                  </p>
                  <a className="link text-small" href={`/api/v1/admin/documents/${d.id}/file`} target="_blank" rel="noopener">
                    Open file (logged)
                  </a>
                </div>
                <div className="flex flex-wrap items-start gap-3 lg:col-span-7">
                  <ActionForm action={reviewDocumentAction} errorTitle="Could not save">
                    <input type="hidden" name="documentId" value={d.id} />
                    <input type="hidden" name="decision" value="approved" />
                    <SubmitButton>Approve</SubmitButton>
                  </ActionForm>
                  <ActionForm action={reviewDocumentAction} errorTitle="Could not save" className="flex-1">
                    <input type="hidden" name="documentId" value={d.id} />
                    <input type="hidden" name="decision" value="rejected" />
                    <div className="flex gap-2">
                      <Input name="note" placeholder="Reason the worker will see" aria-label="Rejection reason" />
                      <SubmitButton variant="secondary">Reject</SubmitButton>
                    </div>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12" aria-labelledby="customer-ids">
        <h2 id="customer-ids" className="font-display text-h2 font-bold">
          Customer IDs ({ids.length})
        </h2>
        <p className="mt-1 text-small text-ink-2">Needed before a customer books elder care, domestic help or medical support. Check that the name matches the account and the last 4 characters match.</p>
        {ids.length === 0 ? (
          <EmptyState title="No customer IDs waiting" body="New uploads appear here." />
        ) : (
          <ul className="mt-4 border-t border-ink">
            {ids.map((c) => (
              <li key={c.id} className="grid gap-4 border-b border-rule py-5 lg:grid-cols-12">
                <div className="lg:col-span-5">
                  <p className="font-semibold">
                    {ID_LABEL[c.idType] ?? c.idType}: {c.displayName ?? 'No name on account'}
                  </p>
                  <p className="text-small text-ink-2">
                    {c.numberMasked} · {c.phoneMasked} · uploaded {formatIst(c.createdAt)}
                  </p>
                  <a className="link text-small" href={`/api/v1/admin/id-checks/${c.id}/file`} target="_blank" rel="noopener">
                    Open file (logged)
                  </a>
                </div>
                <div className="flex flex-wrap items-start gap-3 lg:col-span-7">
                  <ActionForm action={reviewIdCheckAction} errorTitle="Could not save">
                    <input type="hidden" name="checkId" value={c.id} />
                    <input type="hidden" name="decision" value="approved" />
                    <SubmitButton>Approve</SubmitButton>
                  </ActionForm>
                  <ActionForm action={reviewIdCheckAction} errorTitle="Could not save" className="flex-1">
                    <input type="hidden" name="checkId" value={c.id} />
                    <input type="hidden" name="decision" value="rejected" />
                    <div className="flex gap-2">
                      <Input name="note" placeholder="Reason the customer will see" aria-label="Rejection reason" />
                      <SubmitButton variant="secondary">Reject</SubmitButton>
                    </div>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12" aria-labelledby="applicants">
        <h2 id="applicants" className="font-display text-h2 font-bold">
          Applicants to activate ({q.applicants.length})
        </h2>
        <p className="mt-1 text-small text-ink-2">Activation needs approved ID, a valid police certificate and an approved photo.</p>
        <ul className="mt-4 border-t border-ink">
          {q.applicants.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-rule py-4">
              <div>
                <p className="font-semibold">{a.displayName}</p>
                <p className="flex gap-2 text-small">
                  <Pill tone={a.kycStatus === 'verified' ? 'success' : 'warning'}>ID {a.kycStatus}</Pill>
                  <Pill tone={a.photoStatus === 'approved' ? 'success' : 'warning'}>Photo {a.photoStatus}</Pill>
                </p>
              </div>
              <ActionForm action={activateWorkerAction} errorTitle="Not ready">
                <input type="hidden" name="workerId" value={a.id} />
                <SubmitButton variant="secondary">Activate</SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12" aria-labelledby="apps">
        <h2 id="apps" className="font-display text-h2 font-bold">
          Service applications ({q.applications.length})
        </h2>
        <ul className="mt-4 border-t border-ink">
          {q.applications.map((a) => (
            <li key={a.id} className="grid gap-4 border-b border-rule py-4 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <p className="font-semibold">
                  {a.workerName}: {a.serviceName}
                </p>
                <p className="text-small text-ink-2">Worker status: {a.workerStatus}</p>
              </div>
              <div className="flex flex-wrap items-start gap-3 lg:col-span-7">
                <ActionForm action={reviewApplicationAction} errorTitle="Cannot approve">
                  <input type="hidden" name="approvalId" value={a.id} />
                  <input type="hidden" name="decision" value="approved" />
                  <SubmitButton>Approve for service</SubmitButton>
                </ActionForm>
                <ActionForm action={reviewApplicationAction} errorTitle="Could not save" className="flex-1">
                  <input type="hidden" name="approvalId" value={a.id} />
                  <input type="hidden" name="decision" value="rejected" />
                  <div className="flex gap-2">
                    <Input name="reason" placeholder="Reason" aria-label="Rejection reason" />
                    <SubmitButton variant="secondary">Reject</SubmitButton>
                  </div>
                </ActionForm>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
