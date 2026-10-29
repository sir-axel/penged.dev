-- Guilds: small teams of up to 3 players. One guild per player (guild_members.player_id is UNIQUE). Joining is always a request the leader approves.
-- Every write goes through the guild functions (src/guilds.js), guarded on guilds.version.
-- Names live on players only (members are joined at read time), so username/display name changes need no fix-up.
-- Guild score = members' xp_gained from verified matches, counted only from each member's joined_at.

CREATE TABLE guilds (
  id TEXT PRIMARY KEY NOT NULL,
  created_date TEXT NOT NULL,
  updated_date TEXT NOT NULL,
  created_by_id TEXT,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 3 AND 24),
  name_lower TEXT NOT NULL UNIQUE,
  tag TEXT NOT NULL UNIQUE CHECK (length(tag) BETWEEN 2 AND 4),
  color TEXT NOT NULL CHECK (color IN ('red','orange','yellow','green','teal','blue','purple','pink')),
  description TEXT CHECK (description IS NULL OR length(description) <= 140),
  leader_player_id TEXT NOT NULL,
  member_count INTEGER NOT NULL DEFAULT 1 CHECK (member_count BETWEEN 0 AND 3),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE guild_members (
  id TEXT PRIMARY KEY NOT NULL,
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('leader','member')),
  joined_at TEXT NOT NULL,
  created_date TEXT NOT NULL,
  updated_date TEXT NOT NULL
);
CREATE INDEX guild_members_guild_idx ON guild_members(guild_id, joined_at);

CREATE TABLE guild_requests (
  id TEXT PRIMARY KEY NOT NULL,
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  created_date TEXT NOT NULL,
  UNIQUE (guild_id, player_id)
);
CREATE INDEX guild_requests_player_idx ON guild_requests(player_id);

-- Guild scores read verified matches by verification time.
CREATE INDEX matches_status_verified_idx ON matches(status, verified_at);
