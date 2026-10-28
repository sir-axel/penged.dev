-- Chat: an open forum (topics + posts), private 1:1 messages, @mentions, blocks and reports.
-- Never exposed through the public entity endpoints: only via the chat functions (src/chat.js).
-- No foreign keys to players/user: deleting an account removes its private data in deleteAccount; public posts are blanked.

CREATE TABLE forum_topics (
  id TEXT PRIMARY KEY,
  created_date TEXT NOT NULL,
  updated_date TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('general','disputes','lfg')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 120),
  author_user_id TEXT NOT NULL,
  author_player_id TEXT,
  match_id TEXT,
  locked INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  last_post_at TEXT NOT NULL,
  post_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX forum_topics_cat_last_idx ON forum_topics(category, last_post_at DESC);
CREATE INDEX forum_topics_last_idx ON forum_topics(last_post_at DESC);
CREATE INDEX forum_topics_author_idx ON forum_topics(author_user_id, created_date);
CREATE UNIQUE INDEX forum_topics_match_uidx ON forum_topics(match_id) WHERE match_id IS NOT NULL;

CREATE TABLE forum_posts (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE,
  created_date TEXT NOT NULL,
  edited_at TEXT,
  author_user_id TEXT NOT NULL,
  author_player_id TEXT,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  hidden INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX forum_posts_topic_idx ON forum_posts(topic_id, created_date, id);
CREATE INDEX forum_posts_author_idx ON forum_posts(author_user_id, created_date);

CREATE TABLE dm_threads (
  id TEXT PRIMARY KEY,
  created_date TEXT NOT NULL,
  user_a TEXT NOT NULL,
  user_b TEXT NOT NULL,
  last_message_at TEXT,
  CHECK (user_a < user_b),
  UNIQUE (user_a, user_b)
);
CREATE INDEX dm_threads_b_idx ON dm_threads(user_b);

CREATE TABLE dm_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
  created_date TEXT NOT NULL,
  sender_user_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX dm_messages_thread_idx ON dm_messages(thread_id, created_date, id);
CREATE INDEX dm_messages_sender_idx ON dm_messages(sender_user_id, created_date);

CREATE TABLE dm_reads (
  thread_id TEXT NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  last_read_at TEXT NOT NULL,
  PRIMARY KEY (thread_id, user_id)
);

CREATE TABLE mentions (
  id TEXT PRIMARY KEY,
  created_date TEXT NOT NULL,
  mentioned_player_id TEXT NOT NULL,
  mentioned_user_id TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('post','dm')),
  source_id TEXT NOT NULL,
  topic_id TEXT,
  thread_id TEXT,
  by_user_id TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX mentions_user_idx ON mentions(mentioned_user_id, read_at, created_date DESC);
CREATE INDEX mentions_source_idx ON mentions(source_kind, source_id);
CREATE INDEX mentions_thread_idx ON mentions(thread_id) WHERE thread_id IS NOT NULL;

CREATE TABLE blocks (
  blocker_user_id TEXT NOT NULL,
  blocked_user_id TEXT NOT NULL,
  created_date TEXT NOT NULL,
  PRIMARY KEY (blocker_user_id, blocked_user_id)
);
CREATE INDEX blocks_blocked_idx ON blocks(blocked_user_id);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  created_date TEXT NOT NULL,
  reporter_user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('post','dm','topic')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(reason) <= 500),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed'))
);
CREATE INDEX reports_status_idx ON reports(status, created_date DESC);
CREATE INDEX reports_reporter_idx ON reports(reporter_user_id, created_date);
