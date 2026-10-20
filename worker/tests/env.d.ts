import type { D1Migration } from '@cloudflare/vitest-pool-workers';
import type { PmesEnv } from '../src/pmes/env';

declare global {
  namespace Cloudflare {
    interface Env extends PmesEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
