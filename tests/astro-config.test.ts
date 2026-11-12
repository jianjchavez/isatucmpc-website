// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { validateConfig } from 'astro/config';
import siteConfig from '../astro.config.mjs';

it('preserves pre-Astro-7 whitespace around inline elements', async () => {
  // Resolve defaults from the real config, independent of dist/ and build order.
  // Astro 7 defaults compressHTML to 'jsx', which can join adjacent words.
  const config = await validateConfig(siteConfig, fileURLToPath(new URL('../', import.meta.url)), 'build');
  expect(config.compressHTML).toBe(true);
});
