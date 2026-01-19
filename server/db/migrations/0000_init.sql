CREATE TABLE IF NOT EXISTS "recipes" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"image_url" text,
	"date" integer NOT NULL,
	"tags" text DEFAULT '[]',
	"source" text,
	"ingredients" text DEFAULT '[]',
	"steps" text DEFAULT '[]',
	"author_id" text,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL
);
