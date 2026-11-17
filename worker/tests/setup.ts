import { applyD1Migrations, env } from 'cloudflare:test';

// readD1Migrations loads all files, including 0004 after 0002 (0003 is reserved).
// Every test file starts from a migrated, empty PMES database (isolated storage).
await applyD1Migrations(env.PMES_DB, env.TEST_MIGRATIONS);
