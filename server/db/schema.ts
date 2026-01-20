import { pgTable, text, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// Recipe tables
export const recipes = pgTable('recipes', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  date: timestamp('date').notNull(),
  tags: jsonb('tags').$type<string[]>().default([]),
  source: text('source'),
  steps: jsonb('steps').$type<Array<{ title: string; content: string }>>().default([]),
  authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export type Recipe = typeof recipes.$inferSelect
export type NewRecipe = typeof recipes.$inferInsert

// User table for nuxt-auth-utils
// nuxt-auth-utils stores session in cookies, but we can store user data in DB
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  githubId: text('github_id').unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

// Ingredients table
export const ingredients = pgTable('ingredients', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  spoonacularIngredientId: text('spoonacular_ingredient_id'),
  spoonacularData: jsonb('spoonacular_data').$type<any>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export type Ingredient = typeof ingredients.$inferSelect
export type NewIngredient = typeof ingredients.$inferInsert

// Recipe ingredients junction table
export const recipeIngredients = pgTable('recipe_ingredients', {
  id: text('id').primaryKey(),
  recipeId: text('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  ingredientId: text('ingredient_id').notNull().references(() => ingredients.id, { onDelete: 'cascade' }),
  amount: text('amount').notNull(),
  unit: text('unit').notNull(),
  notes: text('notes'),
  order: text('order').notNull().default('0'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export type RecipeIngredient = typeof recipeIngredients.$inferSelect
export type NewRecipeIngredient = typeof recipeIngredients.$inferInsert
