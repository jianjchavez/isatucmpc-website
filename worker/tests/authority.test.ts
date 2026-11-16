import { describe, it, expect, vi, afterEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { ageOn, monthlyDeduction } from '../src/membership/deduction';
import { buildOfficePacket } from '../src/membership/office-packet';
import { notifyTelegram } from '../src/telegram';
import { sendResultEmails, type AttemptRow } from '../src/pmes/email';
import type { PmesEnv } from '../src/pmes/env';

afterEach(() => vi.unstubAllGlobals());

const applicant = {
  firstName: 'Juan', middleName: '', lastName: 'Dela Cruz', extension: '', civilStatus: 'Single',
  spouseName: '', contactNumber: '09170000000', address: 'La Paz, Iloilo City', privacyConsent: true,
};

describe('salary deduction', () => {
  it('spreads the unpaid subscription (after 25 paid shares) over the months, plus PHP 200 welfare for ages 18-55', () => {
    // 50 shares x PHP 50 = 2,500; 25 paid = 1,250 left; 24 months.
    expect(monthlyDeduction(50, 2, 40)).toEqual({ months: 24, capital: 52.08, welfare: 200, total: 252.08 });
    expect(monthlyDeduction(100, 1, 55)).toEqual({ months: 12, capital: 312.5, welfare: 200, total: 512.5 });
  });
  it('leaves the Welfare Fund off over 55', () => {
    expect(monthlyDeduction(50, 2, 56)).toEqual({ months: 24, capital: 52.08, welfare: 0, total: 52.08 });
  });
  it('counts age from the birthday', () => {
    expect(ageOn('1970-11-17', '2026-11-16')).toBe(55);
    expect(ageOn('1970-11-16', '2026-11-16')).toBe(56);
  });
});

describe('office packet with the Authority to Deduct', () => {
  it('adds one page for an ISAT U regular applicant, with or without the Welfare Fund line', async () => {
    for (const age of [40, 60]) {
      const bytes = await buildOfficePacket(applicant, 'November 16, 2026', 'APP-2026-0007', {
        employeeNo: 'EMP-0042', office: 'College of Education', shares: 50, deduction: monthlyDeduction(50, 2, age),
      });
      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(4);
    }
  });
  it('keeps 3 pages for everyone else', async () => {
    const bytes = await buildOfficePacket(applicant, 'November 16, 2026', 'APP-2026-0007');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3);
  });
});

describe('Telegram alert', () => {
  it('posts to the group when both secrets are set', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await notifyTelegram({ TELEGRAM_BOT_TOKEN: 't0ken', TELEGRAM_CHAT_ID: '-100' }, 'hello');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.telegram.org/bott0ken/sendMessage');
    expect(JSON.parse(init.body as string)).toMatchObject({ chat_id: '-100', text: 'hello' });
  });
  it('does nothing without the secrets and never throws', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('https://api.telegram.org/botSECRET'); });
    vi.stubGlobal('fetch', fetchMock);
    await notifyTelegram({}, 'hello');
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(notifyTelegram({ TELEGRAM_BOT_TOKEN: 'x', TELEGRAM_CHAT_ID: '1' }, 'hello')).resolves.toBeUndefined();
  });
});

describe('pass email office-visit step', () => {
  const env = { RESEND_API_KEY: 'k', TO_EMAIL: 'coop@example.com', SITE_URL: 'https://isatucmpc.coop' } as PmesEnv;
  const attempt = {
    id: 'a1', session_id: 1, attempt_no: 1, id_type: 'application', id_number: 'APP-2026-0007', full_name: 'Juan Dela Cruz',
    mobile: '09170000000', email: 'juan@example.com', consent_at: '', draw_json: '[]', answers_json: '[]', score: 18, passed: 1,
    started_at: '', deadline_at: null, submitted_at: '', status: 'submitted', session_date: '2026-11', code: 'PMES-AB23', presenter_name: 'P',
  } as AttemptRow;
  const sentTo = async (a: AttemptRow, passed: boolean) => {
    const sent: { to: string[]; html: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => { sent.push(JSON.parse(init.body as string)); return new Response('{}'); }));
    await sendResultEmails(env, a, { score: 18, total: 20, passed, retakesLeft: 2 }, passed ? { no: 'PMES-2026-0001', key: 'k' } : null);
    return sent.find(m => m.to[0] === 'juan@example.com')!.html;
  };
  it('tells a passing applicant what to bring and pay', async () => {
    const html = await sentTo(attempt, true);
    expect(html).toContain('Next step: one visit to the cooperative office');
    expect(html).toContain('PHP 1,750.00');
    expect(html).toContain('Authority to Deduct from Salary');
  });
  it('is left out for members and for a fail', async () => {
    expect(await sentTo({ ...attempt, id_type: 'member' }, true)).not.toContain('Next step');
    expect(await sentTo(attempt, false)).not.toContain('Next step');
  });
});
