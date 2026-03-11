import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

// Recipe tables
export const recipes = sqliteTable('recipes', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  date: integer('date', { mode: 'timestamp_ms' }).notNull(),
  tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),
  source: text('source'),
  steps: text('steps', { mode: 'json' }).$type<Array<{ title: string; content: string }>>().default([]),
  visibility: text('visibility').notNull().default('public'),
  authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().defaultNow(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().defaultNow()
})

export type Recipe = typeof recipes.$inferSelect
export type NewRecipe = typeof recipes.$inferInsert

// User table for nuxt-auth-utils
// nuxt-auth-utils stores session in cookies, but we can store user data in DB
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('viewer'),
  githubId: text('github_id').unique(),
  googleId: text('google_id').unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().defaultNow(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().defaultNow()
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

// Ingredients table
export const ingredients = sqliteTable('ingredients', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  spoonacularIngredientId: text('spoonacular_ingredient_id'),
  spoonacularData: text('spoonacular_data', { mode: 'json' }).$type<any>(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().defaultNow(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().defaultNow()
})

export type Ingredient = typeof ingredients.$inferSelect
export type NewIngredient = typeof ingredients.$inferInsert

// Recipe ingredients junction table
export const recipeIngredients = sqliteTable('recipe_ingredients', {
  id: text('id').primaryKey(),
  recipeId: text('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  ingredientId: text('ingredient_id').notNull().references(() => ingredients.id, { onDelete: 'cascade' }),
  amount: text('amount').notNull(),
  unit: text('unit').notNull(),
  notes: text('notes'),
  order: text('order').notNull().default('0'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().defaultNow(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().defaultNow()
})

export type RecipeIngredient = typeof recipeIngredients.$inferSelect
export type NewRecipeIngredient = typeof recipeIngredients.$inferInsert
