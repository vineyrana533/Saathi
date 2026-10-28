import { redirect } from 'next/navigation';
import { t, type MessageKey } from '@/i18n';
import { getMyWorkerProfile, listApplicableServices, VEHICLE_CLASSES } from '@/modules/workers/service';
import type { DocumentType } from '@/modules/catalog/config';
import { formatIst } from '@/platform/time';
import { ActionForm, SubmitButton } from '@/ui/action-form';
import { Checkbox, Field, Input, PageHeading, Pill, Select, STATUS_TONE } from '@/ui/primitives';
import { requireSession } from '../../_lib/session';
import { applyAction, uploadDocumentAction } from '../actions';

/** Every worker needs these; each service can add its own (licence, nursing registration and so on). */
const BASE_DOCS: DocumentType[] = ['id_proof', 'police_certificate', 'profile_photo'];

/** Which extra fields each document type asks for, matching documentInput in the workers service. */
const NEEDS_LAST4: DocumentType[] = ['driving_licence', 'id_proof', 'nursing_registration'];
const NEEDS_EXPIRY: DocumentType[] = ['driving_licence', 'nursing_registration'];
const NEEDS_ISSUED: DocumentType[] = ['police_certificate', 'caregiver_training', 'first_aid_certificate', 'medical_qualification'];

export default async function WorkerDocumentsPage() {
  const { ctx } = await requireSession('/worker/documents');
  const mine = await getMyWorkerProfile(ctx);
  if (!mine) redirect('/worker/profile');
  const open = await listApplicableServices();
  const docLabel = (type: string) => t(`worker.docTypes.${type}` as MessageKey);

  // Extra documents come only from services this worker has applied for, so nobody is asked for a
  // nursing registration just to drive.
  const applied = new Set(mine.approvals.map((a) => a.serviceSlug));
  const extraDocs = [...new Set(open.filter((s) => applied.has(s.slug)).flatMap((s) => s.documents))].filter((d) => !BASE_DOCS.includes(d));

  const docSection = (type: DocumentType) => {
    const latest = mine.documents.find((d) => d.docType === type);
    return (
      <section key={type} aria-labelledby={`doc-${type}`} className="border-t border-rule py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id={`doc-${type}`} className="font-display text-h3 font-semibold">
            {docLabel(type)}
          </h3>
          {latest && <Pill tone={STATUS_TONE[latest.status] ?? 'neutral'}>{t(`worker.docStatus.${latest.status}` as MessageKey)}</Pill>}
        </div>
        {latest && (
          <p className="mt-2 text-small text-ink-2">
            {latest.numberMasked ? `${latest.numberMasked}. ` : ''}
            {latest.expiresOn ? `${t('worker.expiresOn')}: ${latest.expiresOn}. ` : ''}
            {formatIst(latest.createdAt, { dateStyle: 'medium' })}
            {latest.reviewNote ? `. ${latest.reviewNote}` : ''}
          </p>
        )}
        {(!latest || latest.status === 'rejected' || latest.status === 'expired') && (
          <ActionForm action={uploadDocumentAction} errorTitle={t('common.errorTitle')} className="mt-6" encType="multipart/form-data">
            <input type="hidden" name="docType" value={type} />
            <Field id={`f-file-${type}`} label={t('worker.file')}>
              <input
                id={`f-file-${type}`}
                name="file"
                type="file"
                accept={type === 'profile_photo' ? 'image/jpeg,image/png' : 'image/jpeg,image/png,application/pdf'}
                required
                className="min-h-12 text-small"
              />
            </Field>
            {type === 'id_proof' && (
              <Field id={`f-idType-${type}`} label={t('worker.idType')}>
                <Select id={`f-idType-${type}`} name="idType">
                  <option value="aadhaar">Aadhaar</option>
                  <option value="pan">PAN</option>
                  <option value="voter_id">Voter ID</option>
                  <option value="passport">Passport</option>
                </Select>
              </Field>
            )}
            {NEEDS_LAST4.includes(type) && (
              <Field id={`f-numberLast4-${type}`} label={t('worker.last4')}>
                <Input id={`f-numberLast4-${type}`} name="numberLast4" maxLength={4} minLength={4} autoComplete="off" required className="max-w-32" />
              </Field>
            )}
            {NEEDS_EXPIRY.includes(type) && (
              <Field id={`f-expiresOn-${type}`} label={t('worker.expiresOn')}>
                <Input id={`f-expiresOn-${type}`} name="expiresOn" type="date" required className="max-w-56" />
              </Field>
            )}
            {type === 'driving_licence' && (
              <fieldset id="f-vehicleClasses">
                <legend className="text-small font-semibold">{t('worker.vehicleClasses')}</legend>
                <div className="mt-2 flex flex-wrap gap-x-6">
                  {VEHICLE_CLASSES.map((v) => (
                    <label key={v} className="flex min-h-11 items-center gap-2">
                      <input type="checkbox" name="vehicleClasses" value={v} defaultChecked={v === 'LMV'} className="size-5 accent-ink" />
                      {v}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {NEEDS_ISSUED.includes(type) && (
              <Field id={`f-issuedOn-${type}`} label={t('worker.issuedOn')}>
                <Input id={`f-issuedOn-${type}`} name="issuedOn" type="date" required className="max-w-56" />
              </Field>
            )}
            <Checkbox id={`f-consent-${type}`} name="consent" required label={t('worker.consent')} />
            <div>
              <SubmitButton variant="secondary">{t('worker.upload')}</SubmitButton>
            </div>
          </ActionForm>
        )}
      </section>
    );
  };

  return (
    <>
      <PageHeading title={t('worker.documentsTitle')} lede={t('worker.documentsLede')} />

      <section id="services" aria-labelledby="services-title" className="border-t border-ink py-8">
        <h2 id="services-title" className="font-display text-h2 font-bold">
          {t('worker.applyTitle')}
        </h2>
        <p className="mt-2 text-ink-2 prose-measure">{t('worker.applyLede')}</p>
        <ul className="mt-4">
          {open.map((s) => {
            const approval = mine.approvals.find((a) => a.serviceSlug === s.slug);
            const extra = s.documents.filter((d) => !BASE_DOCS.includes(d));
            return (
              <li key={s.slug} className="flex flex-wrap items-center justify-between gap-4 border-b border-rule py-4">
                <div>
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-small text-ink-2">
                    {extra.length ? t('worker.needsDocs', { docs: extra.map(docLabel).join(', ') }) : t('worker.needsBasics')}
                  </p>
                </div>
                {approval ? (
                  <p className="flex items-center gap-3">
                    <Pill tone={STATUS_TONE[approval.status] ?? 'neutral'}>{t(`worker.approvalStatus.${approval.status}` as MessageKey)}</Pill>
                    {approval.reason && <span className="text-small text-ink-2">{approval.reason}</span>}
                  </p>
                ) : (
                  <ActionForm action={applyAction} errorTitle={t('common.errorTitle')}>
                    <input type="hidden" name="service" value={s.slug} />
                    <SubmitButton variant="secondary">
                      {t('worker.apply')}
                      <span className="sr-only"> {s.name}</span>
                    </SubmitButton>
                  </ActionForm>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="docs-title" className="border-t border-ink pt-8">
        <h2 id="docs-title" className="font-display text-h2 font-bold">
          {t('worker.documentsTitle')}
        </h2>
        {BASE_DOCS.map(docSection)}
      </section>

      {extraDocs.length > 0 && (
        <section aria-labelledby="extra-docs-title" className="border-t border-ink pt-8">
          <h2 id="extra-docs-title" className="font-display text-h2 font-bold">
            {t('worker.extraDocsTitle')}
          </h2>
          {extraDocs.map(docSection)}
        </section>
      )}
    </>
  );
}
