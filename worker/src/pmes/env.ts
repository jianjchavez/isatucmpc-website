import type { Env } from '../index';

export type PmesEnv = Env & {
  PMES_DB: D1Database;
  PMES_RL: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  PMES_RL_IP: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  PMES_DRAW_STATUS: string;
  PMES_PASS_MARK: string;
  PMES_QUIZ_SIZE: string;
  PMES_MAX_ATTEMPTS: string;
  SITE_URL: string;
  PMES_SESSION_SECRET: string;
};
