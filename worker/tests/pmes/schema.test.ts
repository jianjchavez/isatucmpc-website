import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

describe('pmes schema', () => {
  it('creates the six pmes tables', async () => {
    const { results } = await env.PMES_DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'pmes_%' ORDER BY name",
    ).all<{ name: string }>();
    expect(results.map(r => r.name)).toEqual([
      'pmes_attempts',
      'pmes_certificates',
      'pmes_counters',
      'pmes_overrides',
      'pmes_presenters',
      'pmes_sessions',
    ]);
  });
});
