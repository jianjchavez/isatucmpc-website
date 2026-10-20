import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendResultEmails, type AttemptRow } from '../../src/pmes/email';
import type { PmesEnv } from '../../src/pmes/env';

const env = {
  RESEND_API_KEY: 'test-key',
  TO_EMAIL: 'isatucmpc1964@gmail.com',
  SITE_URL: 'https://isatucmpc.coop',
} as PmesEnv;

const attempt: AttemptRow = {
  id: 'a1',
  session_id: 1,
  attempt_no: 2,
  id_type: 'application',
  id_number: 'APP-0042',
  full_name: 'Attendee <Name> & Co',
  mobile: '09171234567',
  email: 'attendee@example.com',
  consent_at: '2026-10-24T01:00:00Z',
  draw_json: '[]',
  answers_json: '[]',
  score: 18,
  passed: 1,
  started_at: '2026-10-24T01:00:00Z',
  deadline_at: '2026-10-24T01:20:00Z',
  submitted_at: '2026-10-24T01:15:00Z',
  status: 'submitted',
  session_date: '2026-10-24',
  code: 'PMES-AB23',
  presenter_name: 'Presenter Name',
};

type Sent = { from: string; to: string[]; subject: string; html: string; reply_to?: string };
let sent: Sent[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sent = [];
  fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(init.body as string));
    return new Response('{"id":"x"}', { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('sendResultEmails', () => {
  it('pass: attendee gets the certificate subject and link; coop copy carries the identity', async () => {
    const status = await sendResultEmails(env, attempt, { score: 18, total: 20, passed: true, retakesLeft: 0 }, { no: 'PMES-2026-0001', key: 'abc123' });
    expect(status).toBe('sent');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails');
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer test-key' });

    const attendee = sent.find(m => m.to[0] === 'attendee@example.com')!;
    expect(attendee.from).toBe('ISATUCMPC <noreply@isatucmpc.coop>');
    expect(attendee.subject).toBe('PMES result: PASSED, Certificate PMES-2026-0001');
    expect(attendee.html).toContain('https://isatucmpc.coop/pmes/certificate/?no=PMES-2026-0001&amp;key=abc123');
    expect(attendee.html).toContain('Attendee &lt;Name&gt; &amp; Co');
    expect(attendee.html).not.toContain('<Name>');
    expect(attendee.html).toContain('2026-10-24');
    expect(attendee.html).toContain('PMES-AB23');
    expect(attendee.html).toContain('18 of 20');
    expect(attendee.html).toContain('(033) 330-2586 · isatucmpc1964@gmail.com');
    expect(attendee.html).not.toContain('09171234567');

    const coop = sent.find(m => m.to[0] === 'isatucmpc1964@gmail.com')!;
    expect(coop.reply_to).toBe('attendee@example.com');
    expect(coop.subject).toContain('PMES result: PASSED, Certificate PMES-2026-0001');
    expect(coop.html).toContain('Application No.');
    expect(coop.html).toContain('APP-0042');
    expect(coop.html).toContain('09171234567');
    expect(coop.html).toContain('Attempt 2');
    expect(coop.html).toContain('Presenter Name');
    expect(coop.html).toContain('key=abc123');
  });

  it('fail: subject shows score and retake; body carries retakes left, no certificate link', async () => {
    const failed = { ...attempt, score: 13, passed: 0 };
    const status = await sendResultEmails(env, failed, { score: 13, total: 20, passed: false, retakesLeft: 1 }, null);
    expect(status).toBe('sent');
    const attendee = sent.find(m => m.to[0] === 'attendee@example.com')!;
    expect(attendee.subject).toBe('PMES result: 13 of 20, retake available');
    expect(attendee.html).toContain('1 retake');
    expect(attendee.html).not.toContain('/pmes/certificate/');
    const coop = sent.find(m => m.to[0] === 'isatucmpc1964@gmail.com')!;
    expect(coop.html).toContain('Attempt 2');
  });

  it('fail with no retakes left does not promise a retake', async () => {
    await sendResultEmails(env, { ...attempt, score: 13, passed: 0 }, { score: 13, total: 20, passed: false, retakesLeft: 0 }, null);
    const attendee = sent.find(m => m.to[0] === 'attendee@example.com')!;
    expect(attendee.subject).toBe('PMES result: 13 of 20, no retakes left');
    expect(attendee.html).toContain('Education and Training Committee');
  });

  it('a 500 from Resend returns "failed" without throwing', async () => {
    fetchMock.mockImplementation(async () => new Response('err', { status: 500 }));
    await expect(sendResultEmails(env, attempt, { score: 18, total: 20, passed: true, retakesLeft: 0 }, { no: 'PMES-2026-0001', key: 'k' })).resolves.toBe('failed');
  });

  it('one of two sends failing returns "failed"', async () => {
    fetchMock
      .mockImplementationOnce(async () => new Response('ok', { status: 200 }))
      .mockImplementationOnce(async () => new Response('err', { status: 502 }));
    await expect(sendResultEmails(env, attempt, { score: 18, total: 20, passed: true, retakesLeft: 0 }, { no: 'PMES-2026-0001', key: 'k' })).resolves.toBe('failed');
  });

  it('a network error returns "failed" without throwing', async () => {
    fetchMock.mockImplementation(async () => { throw new TypeError('network down'); });
    await expect(sendResultEmails(env, attempt, { score: 18, total: 20, passed: true, retakesLeft: 0 }, { no: 'PMES-2026-0001', key: 'k' })).resolves.toBe('failed');
  });
});
