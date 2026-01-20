-- Create ingredients table
CREATE TABLE IF NOT EXISTS "ingredients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"off_product_id" text,
	"off_product_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ingredients_name_unique" UNIQUE("name")
);

-- Create recipe_ingredients junction table
CREATE TABLE IF NOT EXISTS "recipe_ingredients" (
	"id" text PRIMARY KEY NOT NULL,
	"recipe_id" text NOT NULL,
	"ingredient_id" text NOT NULL,
	"amount" text NOT NULL,
	"unit" text NOT NULL,
	"notes" text,
	"order" text DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "recipe_ingredients_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE cascade ON UPDATE no action
);

-- Migrate existing string ingredients to new structure
-- Note: Migration of existing ingredients should be done via a separate script
-- This migration only creates the tables. Use the migrate.post.ts endpoint to migrate data.

-- Remove old ingredients JSONB column (no backward compatibility needed)
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "ingredients";
