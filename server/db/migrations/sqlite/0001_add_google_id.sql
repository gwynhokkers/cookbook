-- Add Google OAuth provider ID to users
ALTER TABLE "users" ADD COLUMN "google_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_google_id_unique" ON "users" ("google_id");
