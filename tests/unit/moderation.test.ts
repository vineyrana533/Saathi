import { describe, expect, it } from 'vitest';
import { scanText, wordsToDigits } from '@/modules/chat/moderation';

describe('content scanner', () => {
  it.each([
    ['9876543210', 'phone_number'],
    ['+91-98765-43210', 'phone_number'],
    ['(987) 654 3210', 'phone_number'],
    ['nine eight seven six five four three two one zero', 'phone_number'],
    ['nine eight double seven six five four three two one', 'phone_number'],
    ['9 8 7 six 5 4 three 2 1 0', 'phone_number'],
    ['ravi at gmail dot com', 'email'],
    ['ravi.k@gmail.com', 'email'],
    ['send to ravi@ybl', 'upi_id'],
    ['bit.ly/abc', 'link'],
    ['wa.me/919876543210', 'link'],
    ['follow @ravi_drives', 'social_handle'],
    ['message me on whatsapp', 'off_platform_app'],
    ['pay me cash directly', 'off_platform_app'],
    ['looking for a girlfriend experience', 'prohibited_service'],
    ['do you offer massage', 'prohibited_service'],
    ['overnight stay in hotel room', 'prohibited_service'],
  ])('blocks %s (%s)', (text, reason) => {
    const r = scanText(text);
    expect(r.action).toBe('block');
    expect(r.reasons).toContain(reason);
  });

  it.each([
    'Please reach by 9:30, gate 2 of Sector 18 market.',
    'The car is a white Swift, parked at B-12/34.',
    'Pincode 110017, near the metro.',
    'I need you for 4 hours, then drop at T3 terminal.',
    'Thanks, see you tomorrow at 10.',
    'Do not go via the flyover, it is closed.',
  ])('allows ordinary message: %s', (text) => {
    expect(scanText(text)).toEqual({ action: 'allow', reasons: [] });
  });

  it('holds therapy claims for review rather than blocking outright', () => {
    expect(scanText('I can offer therapy sessions')).toEqual({ action: 'review', reasons: ['needs_review'] });
  });

  it('converts number words', () => {
    expect(wordsToDigits('nine eight double seven')).toBe('9877');
    expect(wordsToDigits('ek do teen')).toBe('123');
  });
});
