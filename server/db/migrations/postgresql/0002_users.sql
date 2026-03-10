-- Users table for nuxt-auth-utils
-- Drop old Better Auth tables if they exist
DROP TABLE IF EXISTS "verification";
DROP TABLE IF EXISTS "account";
DROP TABLE IF EXISTS "session";
DROP TABLE IF EXISTS "user";

-- Create new users table
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"github_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id")
);

-- Update recipes table to reference users
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
