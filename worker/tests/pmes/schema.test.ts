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

describe('applications and timed-attempt schema', () => {
  it('ships payload storage and retention in the single unreleased 0004 migration', () => {
    expect(env.TEST_MIGRATIONS.filter(migration => /^000[45]_/.test(migration.name)).map(migration => migration.name))
      .toEqual(['0004_application_payloads.sql']);
  });

  const cols = async (table: string) =>
    (await env.PMES_DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()).results.map(r => r.name);

  it('has application tables and timed-attempt columns', async () => {
    expect(await cols('membership_applications')).toEqual(['no', 'year', 'seq', 'full_name', 'mobile', 'email', 'created_at', 'pulled_at', 'payload_expired_at']);
    expect(await cols('application_payloads')).toEqual(['no', 'payload', 'created_at']);
    expect(await cols('application_counters')).toEqual(['year', 'next_seq']);
    expect(await cols('pmes_attempts')).toEqual(expect.arrayContaining(['current_n', 'served_at']));
  });
});
