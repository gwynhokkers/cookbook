-- Better Auth: user first (referenced by account, session)
CREATE TABLE "user" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT,
  "email" TEXT NOT NULL,
  "email_verified" INTEGER DEFAULT 0 NOT NULL,
  "image" TEXT,
  "created_at" INTEGER DEFAULT (strftime('%s','now')*1000) NOT NULL,
  "updated_at" INTEGER DEFAULT (strftime('%s','now')*1000) NOT NULL,
  UNIQUE("email")
);

CREATE TABLE "account" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "account_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "access_token" TEXT,
  "refresh_token" TEXT,
  "id_token" TEXT,
  "access_token_expires_at" INTEGER,
  "refresh_token_expires_at" INTEGER,
  "scope" TEXT,
  "password" TEXT,
  "created_at" INTEGER DEFAULT (strftime('%s','now')*1000) NOT NULL,
  "updated_at" INTEGER DEFAULT (strftime('%s','now')*1000) NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE "session" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "expires_at" INTEGER NOT NULL,
  "token" TEXT NOT NULL,
  "created_at" INTEGER DEFAULT (strftime('%s','now')*1000) NOT NULL,
  "updated_at" INTEGER DEFAULT (strftime('%s','now')*1000) NOT NULL,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "user_id" TEXT NOT NULL,
  UNIQUE("token"),
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE "verification" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expires_at" INTEGER NOT NULL,
  "created_at" INTEGER DEFAULT (strftime('%s','now')*1000) NOT NULL,
  "updated_at" INTEGER DEFAULT (strftime('%s','now')*1000) NOT NULL
);

-- App: users, then recipes (references users), ingredients, recipe_ingredients
CREATE TABLE "users" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT,
  "email" TEXT NOT NULL,
  "email_verified" INTEGER DEFAULT 0 NOT NULL,
  "image" TEXT,
  "role" TEXT DEFAULT 'viewer' NOT NULL,
  "github_id" TEXT,
  "created_at" INTEGER DEFAULT (strftime('%s','now')*1000) NOT NULL,
  "updated_at" INTEGER DEFAULT (strftime('%s','now')*1000) NOT NULL,
  UNIQUE("email"),
  UNIQUE("github_id")
);

CREATE TABLE "recipes" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "image_url" TEXT,
  "date" INTEGER NOT NULL,
  "tags" TEXT DEFAULT '[]',
  "source" TEXT,
  "ingredients" TEXT DEFAULT '[]',
  "steps" TEXT DEFAULT '[]',
  "author_id" TEXT,
  "visibility" TEXT DEFAULT 'public' NOT NULL,
  "created_at" INTEGER DEFAULT (strftime('%s','now')*1000) NOT NULL,
  "updated_at" INTEGER DEFAULT (strftime('%s','now')*1000) NOT NULL,
  FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE TABLE "ingredients" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "spoonacular_ingredient_id" TEXT,
  "spoonacular_data" TEXT,
  "created_at" INTEGER DEFAULT (strftime('%s','now')*1000) NOT NULL,
  "updated_at" INTEGER DEFAULT (strftime('%s','now')*1000) NOT NULL,
  UNIQUE("name")
);

CREATE TABLE "recipe_ingredients" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "recipe_id" TEXT NOT NULL,
  "ingredient_id" TEXT NOT NULL,
  "amount" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "notes" TEXT,
  "order" TEXT DEFAULT '0' NOT NULL,
  "created_at" INTEGER DEFAULT (strftime('%s','now')*1000) NOT NULL,
  "updated_at" INTEGER DEFAULT (strftime('%s','now')*1000) NOT NULL,
  FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE,
  FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE
);
