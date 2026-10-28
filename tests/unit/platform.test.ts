import { describe, expect, it } from 'vitest';
import { normaliseIndianMobile, maskPhone } from '@/platform/auth/phone';
import { addBusinessMinutes, fromIst, istParts } from '@/platform/time';
import { redact } from '@/platform/logger';
import { can } from '@/platform/auth/permissions';
import { decrypt, encrypt } from '@/platform/crypto';
import { validateSlot } from '@/modules/bookings/validation';
import { PERSONAL_DRIVER_CONFIG } from '@/modules/catalog/seed';

describe('phone numbers', () => {
  it.each(['9876543210', '+91 98765 43210', '098765-43210', '919876543210', '0091 9876543210'])('normalises %s', (input) => {
    expect(normaliseIndianMobile(input)).toBe('+919876543210');
  });
  it.each(['12345', '5876543210', '+1 415 555 0100', 'abc'])('rejects %s', (input) => {
    expect(() => normaliseIndianMobile(input)).toThrow();
  });
  it('masks', () => expect(maskPhone('+919876543210')).toBe('+91 ••••••3210'));
});

describe('IST time', () => {
  it('converts IST wall clock to UTC and back', () => {
    const d = fromIst('2026-11-02', '10:30');
    expect(d.toISOString()).toBe('2026-11-02T05:00:00.000Z');
    expect(istParts(d)).toEqual({ date: '2026-11-02', weekday: 0, minuteOfDay: 630 });
  });
  it('handles the date boundary', () => {
    expect(istParts(new Date('2026-11-01T19:00:00Z'))).toMatchObject({ date: '2026-11-02', minuteOfDay: 30 });
  });
});

describe('booking slot rules (personal driver config)', () => {
  const now = new Date('2026-11-01T00:00:00Z');
  const base = { serviceSlug: 'personal-driver', citySlug: 'delhi', zoneId: '00000000-0000-0000-0000-000000000000', answers: { vehicle_class: 'LMV', transmission: 'manual' } };
  it('accepts a valid slot', () => {
    expect(() => validateSlot(PERSONAL_DRIVER_CONFIG, { ...base, date: '2026-11-03', time: '10:00', durationMinutes: 240 }, now)).not.toThrow();
  });
  it.each([
    [{ date: '2026-11-03', time: '10:00', durationMinutes: 120 }, 'invalid_duration'],
    [{ date: '2026-11-03', time: '10:00', durationMinutes: 270 }, 'invalid_duration'],
    [{ date: '2026-11-01', time: '06:00', durationMinutes: 240 }, 'too_soon'],
    [{ date: '2027-01-15', time: '10:00', durationMinutes: 240 }, 'too_far'],
    [{ date: '2026-11-03', time: '05:00', durationMinutes: 240 }, 'outside_hours'],
    [{ date: '2026-11-03', time: '20:00', durationMinutes: 240 }, 'outside_hours'],
  ])('rejects %o with %s', (slot, code) => {
    expect(() => validateSlot(PERSONAL_DRIVER_CONFIG, { ...base, ...slot }, now)).toThrow(expect.objectContaining({ code }));
  });
  it('requires answers and rejects contact details in free text', () => {
    expect(() => validateSlot(PERSONAL_DRIVER_CONFIG, { ...base, answers: {}, date: '2026-11-03', time: '10:00', durationMinutes: 240 }, now)).toThrow(
      expect.objectContaining({ code: 'missing_answer' }),
    );
    expect(() =>
      validateSlot(PERSONAL_DRIVER_CONFIG, { ...base, answers: { ...base.answers, trip_notes: 'call 9876543210' }, date: '2026-11-03', time: '10:00', durationMinutes: 240 }, now),
    ).toThrow(expect.objectContaining({ code: 'answer_blocked' }));
  });
});

describe('logger redaction', () => {
  it('removes personal data', () => {
    expect(redact({ phone: '+919876543210', note: 'call 98765 43210 or a@b.co', nested: { otp: '123456' } })).toEqual({
      phone: '[redacted]',
      note: 'call [number] or [email]',
      nested: { otp: '[redacted]' },
    });
  });
});

describe('permissions', () => {
  const ctx = (roles: string[]) => ({ userId: 'u', roles: roles as never, requestId: 'r' });
  it('follows the matrix', () => {
    expect(can(ctx(['customer']), 'booking.create')).toBe(true);
    expect(can(ctx(['customer']), 'catalog.manage')).toBe(false);
    expect(can(ctx(['worker']), 'booking.start_finish')).toBe(true);
    expect(can(ctx(['customer']), 'booking.start_finish')).toBe(false);
    expect(can(ctx(['verifier']), 'worker.verify')).toBe(true);
    expect(can(ctx(['ops']), 'worker.documents.read')).toBe(false);
    expect(can(ctx(['finance']), 'ledger.read_all')).toBe(true);
  });
});

describe('document encryption', () => {
  it('round-trips and detects tampering', () => {
    const blob = encrypt(Buffer.from('licence scan'));
    expect(decrypt(blob).toString()).toBe('licence scan');
    blob.writeUInt8(blob.readUInt8(blob.length - 1) ^ 1, blob.length - 1);
    expect(() => decrypt(blob)).toThrow();
  });
});

describe('business hours', () => {
  const hours = { startMinute: 9 * 60, endMinute: 19 * 60, weekdays: [0, 1, 2, 3, 4, 5] };
  const at = (date: string, time: string) => fromIst(date, time);
  it('adds working minutes inside the day', () => {
    // 2026-10-28 is a Wednesday.
    expect(addBusinessMinutes(at('2026-10-28', '10:00'), 120, hours)).toEqual(at('2026-10-28', '12:00'));
  });
  it('carries over evenings, starts at opening time, and skips Sunday', () => {
    expect(addBusinessMinutes(at('2026-10-28', '18:30'), 120, hours)).toEqual(at('2026-10-29', '10:30'));
    expect(addBusinessMinutes(at('2026-10-28', '06:00'), 120, hours)).toEqual(at('2026-10-28', '11:00'));
    expect(addBusinessMinutes(at('2026-10-31', '18:00'), 120, hours)).toEqual(at('2026-11-02', '10:00'));
    expect(addBusinessMinutes(at('2026-11-01', '12:00'), 30, hours)).toEqual(at('2026-11-02', '09:30'));
  });
});
