import { applyD1Migrations, env } from 'cloudflare:test';

// Every test file starts from a migrated, empty PMES database (isolated storage).
await applyD1Migrations(env.PMES_DB, env.TEST_MIGRATIONS);
