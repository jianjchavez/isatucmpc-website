-- Standing online PMES session (board paper Item 3, behind PMES_SELF_PACED): a pmes_sessions row whose
-- session_date is YYYY-MM is valid for that whole Asia/Manila month. At most one per month, open or closed,
-- so the three-attempt limit per session cannot be reset by opening a second one.
CREATE UNIQUE INDEX idx_sessions_one_online_per_month ON pmes_sessions(session_date) WHERE length(session_date) = 7;
