export type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** Turns the booking query string into service input. Answers arrive as a.<questionId>. */
export function slotFromParams(service: string, sp: SearchParams) {
  const answers: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (k.startsWith('a.')) answers[k.slice(2)] = one(v);
  const gender = one(sp.gender);
  return {
    serviceSlug: service,
    citySlug: one(sp.city),
    zoneId: one(sp.zone) || undefined,
    localityId: one(sp.loc) || undefined,
    lat: one(sp.lat) ? Number(one(sp.lat)) : undefined,
    lng: one(sp.lng) ? Number(one(sp.lng)) : undefined,
    date: one(sp.date),
    time: one(sp.time),
    durationMinutes: Number(one(sp.duration)) || 0,
    answers,
    workerGender: gender === 'female' || gender === 'male' ? (gender as 'female' | 'male') : null,
    page: Math.max(1, Number(one(sp.page)) || 1),
  };
}

export function toQuery(sp: SearchParams, extra: Record<string, string> = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v !== undefined && k !== 'page' && k !== 'worker') q.set(k, one(v));
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q.toString();
}
