-- Avatar storage fallback used when no R2 `AVATARS` binding exists (see src/uploads.js).
CREATE TABLE avatars (
  id text PRIMARY KEY NOT NULL,
  content_type text NOT NULL,
  data blob NOT NULL,
  created text NOT NULL
);
