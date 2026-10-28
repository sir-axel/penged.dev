-- Reply threads on feedback: admins reply, the author sees it and can follow up. admin_note stays private.
CREATE TABLE feedback_replies (
  id TEXT PRIMARY KEY,
  feedback_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  created_date TEXT NOT NULL,
  author_user_id TEXT,
  author_role TEXT NOT NULL CHECK (author_role IN ('admin','user')),
  author_name TEXT,
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 2000)
);
CREATE INDEX feedback_replies_thread_idx ON feedback_replies(feedback_id, created_date);
CREATE INDEX feedback_replies_author_idx ON feedback_replies(author_user_id, created_date);
ALTER TABLE feedback ADD COLUMN last_reply_at TEXT;
ALTER TABLE feedback ADD COLUMN user_unread INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feedback ADD COLUMN reply_count INTEGER NOT NULL DEFAULT 0;
