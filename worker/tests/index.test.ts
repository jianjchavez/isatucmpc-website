import { describe, it, expect } from 'vitest';
import worker from '../src/index';

const env = {
  SITE_ORIGIN: 'https://isatucmpc.coop',
  TO_EMAIL: 'isatucmpc1964@gmail.com',
  RESEND_API_KEY: 'test-key',
  TURNSTILE_SECRET: 'test-secret',
};

describe('forms worker', () => {
  it('rejects non-POST', async () => {
    const res = await worker.fetch(new Request('https://forms.isatucmpc.coop/api/submit', { method: 'GET' }), env, {} as any);
    expect(res.status).toBe(405);
  });
  it('rejects cross-origin requests', async () => {
    const res = await worker.fetch(new Request('https://forms.isatucmpc.coop/api/submit', {
      method: 'POST',
      headers: { 'origin': 'https://evil.example.com', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'X', email: 'x@x.com', message: 'spam', 'cf-turnstile-response': 't' }),
    }), env, {} as any);
    expect(res.status).toBe(403);
  });
  it('rejects missing fields', async () => {
    const res = await worker.fetch(new Request('https://forms.isatucmpc.coop/api/submit', {
      method: 'POST',
      headers: { 'origin': 'https://isatucmpc.coop', 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    }), env, {} as any);
    expect(res.status).toBe(400);
  });
});
