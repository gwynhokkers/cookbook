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
  ingredients: jsonb('ingredients').$type<string[]>().default([]),
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
