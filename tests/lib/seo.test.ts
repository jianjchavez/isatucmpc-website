import { describe, it, expect } from 'vitest';
import { buildOrgSchema, buildLocalBusinessSchema, buildFaqSchema } from '~/lib/seo';
import { FAQ } from '~/data/faq';

describe('SEO schema builders', () => {
  it('Organization schema has correct @type, name, and url', () => {
    const s = buildOrgSchema();
    expect(s['@type']).toBe('Organization');
    expect(s.name).toMatch(/ISATUCMPC|Iloilo Science/);
    expect(s.url).toBe('https://isatucmpc.coop');
  });
  it('LocalBusiness schema has address + telephone', () => {
    const s = buildLocalBusinessSchema();
    expect(s['@type']).toBe('LocalBusiness');
    expect(s.address.streetAddress).toContain('Burgos');
    expect(s.telephone).toBe('+63-33-330-2586');
  });
  it('FAQ schema wraps each Q&A as Question', () => {
    const s = buildFaqSchema(FAQ);
    expect(s.mainEntity).toHaveLength(FAQ.length);
    expect(s.mainEntity[0]['@type']).toBe('Question');
  });
});
