-- Per-account opt-out for notification emails (challenges and match results). 1 = on (the default), 0 = off.
-- Lives on the Better Auth "user" row next to the email it governs; only writable through setEmailNotifications.
ALTER TABLE "user" ADD COLUMN "email_notifications" INTEGER NOT NULL DEFAULT 1 CHECK ("email_notifications" IN (0, 1));
