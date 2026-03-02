-- Add role column to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'viewer' NOT NULL;

-- Add visibility column to recipes table
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "visibility" text DEFAULT 'public' NOT NULL;
