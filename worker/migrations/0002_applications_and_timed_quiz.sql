-- Website membership application numbers APP-YYYY-NNNN, and the 30-second-per-question quiz
-- (plan docs/superpowers/plans/2026-10-26-application-no-pmes-timer.md).
CREATE TABLE membership_applications (
  no TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE application_counters (
  year INTEGER PRIMARY KEY,
  next_seq INTEGER NOT NULL
);

-- current_n = the question now being served (1-based); served_at = when it was served.
ALTER TABLE pmes_attempts ADD COLUMN current_n INTEGER NOT NULL DEFAULT 1;
ALTER TABLE pmes_attempts ADD COLUMN served_at TEXT;
