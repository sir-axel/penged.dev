-- Per-account display theme: 'light' | 'dark', or NULL until the person picks one (then the device's preference applies).
ALTER TABLE "user" ADD COLUMN "theme" text CHECK ("theme" IN ('light', 'dark'));
