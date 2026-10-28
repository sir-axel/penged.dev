-- User feedback (bugs, ideas, other). Never exposed through the public entity endpoints: admin-only via functions.
CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  created_date TEXT NOT NULL,
  updated_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('bug','idea','other')),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 2000),
  page TEXT CHECK (page IS NULL OR length(page) <= 200),
  contact TEXT CHECK (contact IS NULL OR length(contact) <= 200),
  user_id TEXT,
  player_id TEXT,
  username TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','done')),
  admin_note TEXT,
  ip_hash TEXT NOT NULL,
  user_agent TEXT CHECK (user_agent IS NULL OR length(user_agent) <= 200)
);
CREATE INDEX feedback_status_created_idx ON feedback(status, created_date);
CREATE INDEX feedback_ip_created_idx ON feedback(ip_hash, created_date);
CREATE INDEX feedback_user_created_idx ON feedback(user_id, created_date);
