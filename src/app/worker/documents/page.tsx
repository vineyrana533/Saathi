import { redirect } from 'next/navigation';
import { t, type MessageKey } from '@/i18n';
import { getMyWorkerProfile, VEHICLE_CLASSES } from '@/modules/workers/service';
import { formatIst } from '@/platform/time';
import { ActionForm, SubmitButton } from '@/ui/action-form';
import { Checkbox, Field, Input, PageHeading, Pill, Select, STATUS_TONE } from '@/ui/primitives';
import { requireSession } from '../../_lib/session';
import { applyAction, uploadDocumentAction } from '../actions';

const DOCS = ['driving_licence', 'police_certificate', 'id_proof', 'profile_photo'] as const;

export default async function WorkerDocumentsPage() {
  const { ctx } = await requireSession('/worker/documents');
  const mine = await getMyWorkerProfile(ctx);
  if (!mine) redirect('/worker/profile');
  const driverApproval = mine.approvals.find((a) => a.serviceSlug === 'personal-driver');

  return (
    <>
      <PageHeading title={t('worker.documentsTitle')} lede={t('worker.documentsLede')} />
      {DOCS.map((type) => {
        const latest = mine.documents.find((d) => d.docType === type);
        return (
          <section key={type} aria-labelledby={`doc-${type}`} className="border-t border-ink py-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id={`doc-${type}`} className="font-display text-h3 font-semibold">
                {t(`worker.docTypes.${type}`)}
              </h2>
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
                <Field id="f-file" label={t('worker.file')}>
                  <input id="f-file" name="file" type="file" accept={type === 'profile_photo' ? 'image/jpeg,image/png' : 'image/jpeg,image/png,application/pdf'} required className="min-h-12 text-small" />
                </Field>
                {type === 'id_proof' && (
                  <Field id="f-idType" label={t('worker.idType')}>
                    <Select id="f-idType" name="idType">
                      <option value="aadhaar">Aadhaar</option>
                      <option value="pan">PAN</option>
                      <option value="voter_id">Voter ID</option>
                      <option value="passport">Passport</option>
                    </Select>
                  </Field>
                )}
                {(type === 'driving_licence' || type === 'id_proof') && (
                  <Field id="f-numberLast4" label={t('worker.last4')}>
                    <Input id="f-numberLast4" name="numberLast4" maxLength={4} minLength={4} autoComplete="off" required className="max-w-32" />
                  </Field>
                )}
                {type === 'driving_licence' && (
                  <>
                    <Field id="f-expiresOn" label={t('worker.expiresOn')}>
                      <Input id="f-expiresOn" name="expiresOn" type="date" required className="max-w-56" />
                    </Field>
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
                  </>
                )}
                {type === 'police_certificate' && (
                  <Field id="f-issuedOn" label={t('worker.issuedOn')}>
                    <Input id="f-issuedOn" name="issuedOn" type="date" required className="max-w-56" />
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
      })}
      <section id="services" aria-labelledby="services-title" className="border-t border-ink py-8">
        <h2 id="services-title" className="font-display text-h3 font-semibold">
          {t('worker.applyTitle')}
        </h2>
        {driverApproval ? (
          <p className="mt-3 flex items-center gap-3">
            {driverApproval.serviceName}
            <Pill tone={STATUS_TONE[driverApproval.status] ?? 'neutral'}>{t(`worker.approvalStatus.${driverApproval.status}` as MessageKey)}</Pill>
            {driverApproval.reason && <span className="text-small text-ink-2">{driverApproval.reason}</span>}
          </p>
        ) : (
          <ActionForm action={applyAction} errorTitle={t('common.errorTitle')} className="mt-4">
            <input type="hidden" name="service" value="personal-driver" />
            <div>
              <SubmitButton>{t('worker.apply')}</SubmitButton>
            </div>
          </ActionForm>
        )}
      </section>
    </>
  );
}
