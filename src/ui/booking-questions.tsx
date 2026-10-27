import type { BookingQuestion } from '@/modules/catalog/config';
import { Field, Input, Select } from './primitives';

/** Renders a service's configured booking questions (section 11: custom questions per service). */
export function BookingQuestions({ questions, values = {}, optionalLabel }: { questions: BookingQuestion[]; values?: Record<string, string>; optionalLabel: string }) {
  return (
    <>
      {questions.map((q) => {
        const id = `f-answers-${q.id}`;
        const name = `a.${q.id}`;
        return (
          <Field key={q.id} id={id} label={q.label} help={q.help} optional={q.required ? undefined : optionalLabel}>
            {q.type === 'select' ? (
              <Select id={id} name={name} required={q.required} defaultValue={values[q.id] ?? q.options?.[0]?.value}>
                {q.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            ) : (
              <Input id={id} name={name} type={q.type === 'number' ? 'number' : 'text'} maxLength={q.maxLength} defaultValue={values[q.id] ?? ''} />
            )}
          </Field>
        );
      })}
    </>
  );
}
