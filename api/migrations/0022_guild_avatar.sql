-- Guild picture: an /api/files/<uuid>.<ext> image the leader uploaded (same store as player avatars). NULL = pixel shield.
ALTER TABLE guilds ADD COLUMN avatar_url TEXT;
