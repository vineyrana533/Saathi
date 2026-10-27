import { describe, expect, it } from 'vitest';
import { POST as requestOtp } from '@/app/api/v1/auth/otp/request/route';
import { POST as verifyOtp } from '@/app/api/v1/auth/otp/verify/route';
import { GET as me } from '@/app/api/v1/me/route';
import { POST as logout } from '@/app/api/v1/auth/logout/route';
import { requestLoginOtp, verifyLoginOtp, resolveSession } from '@/modules/identity/service';
import { randomPhone } from '../helpers/fixtures';

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://test', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.${Math.floor(Math.random() * 250)}.1`, ...headers } });
const noParams = { params: Promise.resolve({}) };

describe('phone OTP sign-in', () => {
  it('signs in a listed test phone with the fixed dev code and creates a customer', async () => {
    const phone = '+919000000005';
    expect((await requestOtp(post({ phone: '90000 00005' }), noParams)).status).toBe(200);
    const res = await verifyOtp(post({ phone, code: '123456' }), noParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(res.headers.get('set-cookie')).toMatch(/saathi_session=.*HttpOnly; SameSite=Lax/);

    const who = await (await me(new Request('http://test', { headers: { authorization: `Bearer ${body.token}` } }), noParams)).json();
    expect(who.roles).toContain('customer');
    expect(who.phone).toBe('+91 ••••••0005');

    await logout(new Request('http://test', { method: 'POST', headers: { authorization: `Bearer ${body.token}` } }), noParams);
    expect(await resolveSession(body.token)).toBeNull();
  });

  it('rejects wrong codes, counts attempts and locks after five', async () => {
    const phone = randomPhone();
    await requestLoginOtp({ phone, ip: '10.9.9.9' });
    for (let i = 0; i < 5; i++) {
      await expect(verifyLoginOtp({ phone, code: '000000' })).rejects.toMatchObject({ code: expect.stringMatching(/otp_wrong/) });
    }
    await expect(verifyLoginOtp({ phone, code: '000000' })).rejects.toMatchObject({ code: 'otp_locked' });
  });

  it('rate limits OTP requests per phone', async () => {
    const phone = randomPhone();
    for (let i = 0; i < 3; i++) await requestLoginOtp({ phone, ip: `10.8.8.${i}` });
    await expect(requestLoginOtp({ phone, ip: '10.8.8.9' })).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('never issues the fixed code for a phone that is not on the test list', async () => {
    const phone = randomPhone();
    await requestLoginOtp({ phone, ip: '10.7.7.7' });
    await expect(verifyLoginOtp({ phone, code: '123456' })).rejects.toMatchObject({ code: 'otp_wrong' });
  });

  it('returns a clear error for malformed numbers', async () => {
    const res = await requestOtp(post({ phone: '12345 67890' }), noParams);
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe('invalid_phone');
  });
});
