import { describe, it, expect } from 'vitest';
import worker from '../src/index';

const env = {
  SITE_ORIGIN: 'https://isatucmpc.coop,https://isatucmpc.pages.dev',
  TO_EMAIL: 'isatucmpc1964@gmail.com',
  RESEND_API_KEY: 'test-key',
  TURNSTILE_SECRET: 'test-secret',
};

describe('forms worker', () => {
  it('rejects non-POST', async () => {
    const res = await worker.fetch(new Request('https://forms.isatucmpc.coop/api/submit', { method: 'GET' }), env, {} as any);
    expect(res.status).toBe(405);
  });
  it('answers CORS preflight from allowed origin with 204 + ACAO', async () => {
    const res = await worker.fetch(new Request('https://forms.isatucmpc.coop/api/submit', {
      method: 'OPTIONS',
      headers: {
        'origin': 'https://isatucmpc.pages.dev',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    }), env, {} as any);
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://isatucmpc.pages.dev');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });
  it('CORS preflight from disallowed origin returns no ACAO', async () => {
    const res = await worker.fetch(new Request('https://forms.isatucmpc.coop/api/submit', {
      method: 'OPTIONS',
      headers: {
        'origin': 'https://evil.example.com',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    }), env, {} as any);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('actual POST response includes ACAO for allowed origin', async () => {
    const res = await worker.fetch(new Request('https://forms.isatucmpc.coop/api/submit', {
      method: 'POST',
      headers: { 'origin': 'https://isatucmpc.pages.dev', 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    }), env, {} as any);
    expect(res.status).toBe(400);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://isatucmpc.pages.dev');
  });
  it('rejects cross-origin requests', async () => {
    const res = await worker.fetch(new Request('https://forms.isatucmpc.coop/api/submit', {
      method: 'POST',
      headers: { 'origin': 'https://evil.example.com', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'X', email: 'x@x.com', message: 'spam', 'cf-turnstile-response': 't' }),
    }), env, {} as any);
    expect(res.status).toBe(403);
  });
  it('rejects requests with no Origin header', async () => {
    const res = await worker.fetch(new Request('https://forms.isatucmpc.coop/api/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'X', email: 'x@x.com', message: 'spam', 'cf-turnstile-response': 't' }),
    }), env, {} as any);
    expect(res.status).toBe(403);
  });
  it('accepts isatucmpc.coop origin (custom domain)', async () => {
    const res = await worker.fetch(new Request('https://forms.isatucmpc.coop/api/submit', {
      method: 'POST',
      headers: { 'origin': 'https://isatucmpc.coop', 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    }), env, {} as any);
    expect(res.status).not.toBe(403);
  });
  it('accepts isatucmpc.pages.dev origin (pre-cutover)', async () => {
    const res = await worker.fetch(new Request('https://forms.isatucmpc.coop/api/submit', {
      method: 'POST',
      headers: { 'origin': 'https://isatucmpc.pages.dev', 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    }), env, {} as any);
    expect(res.status).not.toBe(403);
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
