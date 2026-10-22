import { describe, it, expect, vi, afterEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import worker from '../src/index';
import { buildOfficePacket, parseApplicant, validSubscription } from '../src/membership/office-packet';

const env = {
  SITE_ORIGIN: 'https://isatucmpc.coop',
  TO_EMAIL: 'isatucmpc1964@gmail.com',
  RESEND_API_KEY: 'test-key',
  TURNSTILE_SECRET: 'test-secret',
};

const applicant = {
  firstName: 'Juan', middleName: 'Santos', lastName: 'Dela Cruz', extension: '',
  civilStatus: 'Married', spouseName: 'Maria Dela Cruz', contactNumber: '0917 000 0000',
  address: '123 Rizal St., La Paz, Iloilo City', privacyConsent: true,
};

function submit(extra: Record<string, string>) {
  return worker.fetch(new Request('https://forms.isatucmpc.coop/api/submit', {
    method: 'POST',
    headers: { origin: 'https://isatucmpc.coop', 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Juan Santos Dela Cruz', email: 'juan@example.com', message: 'Membership type: Regular',
      'cf-turnstile-response': 't', 'form-source': 'membership', ...extra,
    }),
  }), env, {} as any);
}

afterEach(() => vi.restoreAllMocks());

describe('membership subscription rules', () => {
  it('needs at least 500 whole shares and at least one year', () => {
    expect(validSubscription('500', '5')).toBe(true);
    expect(validSubscription('1200', '1')).toBe(true);
    expect(validSubscription('499', '5')).toBe(false);
    expect(validSubscription('500.5', '5')).toBe(false);
    expect(validSubscription('500', '0')).toBe(false);
    expect(validSubscription(undefined, '5')).toBe(false);
  });
});

describe('parseApplicant', () => {
  it('reads the form JSON', () => {
    expect(parseApplicant(JSON.stringify(applicant))).toEqual(applicant);
  });
  it('rejects malformed or nameless input', () => {
    expect(parseApplicant('not json')).toBeNull();
    expect(parseApplicant(undefined)).toBeNull();
    expect(parseApplicant(JSON.stringify({ ...applicant, lastName: '' }))).toBeNull();
    expect(parseApplicant(JSON.stringify({ ...applicant, address: 'x'.repeat(301) }))).toBeNull();
  });
});

describe('office packet', () => {
  it('fills the 3 office pages', async () => {
    const bytes = await buildOfficePacket(applicant, 'October 23, 2026');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3);
  });

  it('rejects a subscription under 500 shares before checking Turnstile', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await submit({ shares: '400', years: '5', applicant: JSON.stringify(applicant) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid-subscription' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('attaches the office packet to the coop email only', async () => {
    const sent: any[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes('turnstile')) return Response.json({ success: true });
      sent.push(JSON.parse(String(init?.body)));
      return Response.json({ id: 'x' });
    });
    const res = await submit({ shares: '500', years: '5', applicant: JSON.stringify(applicant) });
    expect(res.status).toBe(200);
    const [toCoop, toApplicant] = sent;
    expect(toCoop.to).toEqual([env.TO_EMAIL]);
    expect(toCoop.attachments[0].filename).toBe('ISATUCMPC_Office_Packet_DelaCruz_Juan.pdf');
    expect(toCoop.html).toContain('Office packet attached');
    const pdf = await PDFDocument.load(Uint8Array.from(atob(toCoop.attachments[0].content), ch => ch.charCodeAt(0)));
    expect(pdf.getPageCount()).toBe(3);
    expect(toApplicant.attachments).toBeUndefined();
  });

  it('still emails the coop when the applicant details cannot be read', async () => {
    const sent: any[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes('turnstile')) return Response.json({ success: true });
      sent.push(JSON.parse(String(init?.body)));
      return Response.json({ id: 'x' });
    });
    const res = await submit({ shares: '500', years: '5', applicant: 'garbled' });
    expect(res.status).toBe(200);
    expect(sent[0].attachments).toBeUndefined();
    expect(sent[0].html).toContain('Office packet not attached');
  });
});
