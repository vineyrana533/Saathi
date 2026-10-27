/**
 * India Standard Time helpers. IST is a fixed UTC+05:30 with no daylight saving,
 * so plain offset arithmetic is exact. Storage is always UTC.
 */
export const IST_OFFSET_MINUTES = 330;
export const TIME_ZONE = 'Asia/Kolkata';

export interface IstParts {
  date: string; // YYYY-MM-DD
  weekday: number; // 0 = Monday ... 6 = Sunday
  minuteOfDay: number;
}

export function istParts(d: Date): IstParts {
  const shifted = new Date(d.getTime() + IST_OFFSET_MINUTES * 60_000);
  const jsDay = shifted.getUTCDay(); // 0 = Sunday
  return {
    date: shifted.toISOString().slice(0, 10),
    weekday: (jsDay + 6) % 7,
    minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** Builds a UTC Date from an IST wall-clock date (YYYY-MM-DD) and time (HH:MM). */
export function fromIst(date: string, time: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m || !t) throw new Error('invalid IST date or time');
  const utcMs =
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(t[1]), Number(t[2])) - IST_OFFSET_MINUTES * 60_000;
  const d = new Date(utcMs);
  if (Number.isNaN(d.getTime())) throw new Error('invalid IST date or time');
  return d;
}

export const formatIst = (d: Date, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: TIME_ZONE, ...opts }).format(d);

export const todayIst = () => istParts(new Date()).date;
export const tomorrowIst = () => istParts(new Date(Date.now() + 86_400_000)).date;

export const minutesToHhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
