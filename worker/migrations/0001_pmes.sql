-- PMES certification quiz (spec docs/superpowers/specs/2026-10-21-pmes-quiz-design.md §6)
CREATE TABLE pmes_presenters (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE pmes_sessions (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL,
  session_date TEXT NOT NULL,
  venue TEXT NOT NULL,
  presenter_name TEXT NOT NULL,
  chair_name TEXT NOT NULL,
  presenter_id INTEGER NOT NULL REFERENCES pmes_presenters(id),
  timer_minutes INTEGER NOT NULL DEFAULT 20,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  closed_at TEXT,
  UNIQUE(session_date, code)
);

CREATE TABLE pmes_attempts (
  id TEXT PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES pmes_sessions(id),
  attempt_no INTEGER NOT NULL,
  id_type TEXT NOT NULL,
  id_number TEXT NOT NULL,
  full_name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  email TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  draw_json TEXT NOT NULL,
  answers_json TEXT,
  score INTEGER,
  passed INTEGER,
  started_at TEXT NOT NULL,
  deadline_at TEXT,
  submitted_at TEXT,
  status TEXT NOT NULL DEFAULT 'started',
  UNIQUE(session_id, id_type, id_number, attempt_no)
);
CREATE INDEX idx_attempts_session ON pmes_attempts(session_id);
CREATE INDEX idx_attempts_identity ON pmes_attempts(session_id, id_type, id_number);

CREATE TABLE pmes_certificates (
  no TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  attempt_id TEXT NOT NULL UNIQUE REFERENCES pmes_attempts(id),
  key TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  email_status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE pmes_counters (
  year INTEGER PRIMARY KEY,
  next_seq INTEGER NOT NULL
);

CREATE TABLE pmes_overrides (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES pmes_sessions(id),
  id_type TEXT NOT NULL,
  id_number TEXT NOT NULL,
  extra_attempts INTEGER NOT NULL DEFAULT 3,
  reason TEXT NOT NULL,
  presenter_id INTEGER NOT NULL REFERENCES pmes_presenters(id),
  created_at TEXT NOT NULL
);
