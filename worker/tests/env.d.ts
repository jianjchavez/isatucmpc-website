import type { D1Migration } from '@cloudflare/vitest-pool-workers';
import type { PmesEnv } from '../src/pmes/env';

// @cloudflare/vitest-pool-workers 0.16 types `env` from 'cloudflare:test' as the global `Cloudflare.Env`.
declare global {
  namespace Cloudflare {
    interface Env extends PmesEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
