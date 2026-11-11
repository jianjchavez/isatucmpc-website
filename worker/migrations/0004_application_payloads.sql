-- Full records are stored only while WEBSITE_APP_PULL is on.
CREATE TABLE application_payloads (
  no TEXT PRIMARY KEY REFERENCES membership_applications(no),
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
ALTER TABLE membership_applications ADD COLUMN pulled_at TEXT;
CREATE INDEX application_payloads_created_at ON application_payloads(created_at);
