import type { D1Migration } from '@cloudflare/vitest-pool-workers';
import type { PmesEnv } from '../src/pmes/env';

declare module 'cloudflare:test' {
  interface ProvidedEnv extends PmesEnv {
    TEST_MIGRATIONS: D1Migration[];
  }
}
