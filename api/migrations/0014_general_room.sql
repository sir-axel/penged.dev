-- The General room: one permanent forum topic that the web app shows as a single live chat stream.
-- Every General message is a forum_posts row with topic_id = 'general'. Other (older) non-dispute topics stay in the
-- table untouched; the app just no longer lists them. Idempotent, so the API can also re-create it if ever missing.
INSERT OR IGNORE INTO forum_topics (id, created_date, updated_date, category, title, author_user_id, author_player_id, match_id, locked, hidden, last_post_at, post_count)
VALUES ('general', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', 'general', 'General', 'system', NULL, NULL, 0, 0, '2020-01-01T00:00:00.000Z', 0);
