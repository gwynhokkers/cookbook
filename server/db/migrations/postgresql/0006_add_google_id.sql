-- Add Google OAuth provider ID to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_id" text;
-- Add unique constraint (skip if already exists, e.g. re-run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_google_id_unique'
  ) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_google_id_unique" UNIQUE ("google_id");
  END IF;
END $$;
