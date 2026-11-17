-- Face-to-face PMES has no quiz (Board and Education and Training Committee, 2026-11-17).
-- A day session in 'attendance' mode records self check-ins as pmes_attempts rows with status
-- 'attended' and no draw; the presenter confirms them, which issues the certificate from the same
-- PMES-YYYY-NNNN counter as online passes. Sessions created before this keep 'quiz'.
ALTER TABLE pmes_sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'quiz';
