import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '~~/server/db/schema'

const migrationsDir = fileURLToPath(new URL('../../server/db/migrations/sqlite', import.meta.url))

export function createTestDb() {
  const sqlite = new Database(':memory:')
  for (const file of readdirSync(migrationsDir).filter(name => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(`${migrationsDir}/${file}`, 'utf8'))
  }
  return drizzle(sqlite, { schema })
}

export type TestDb = ReturnType<typeof createTestDb>

export async function seedUser(db: TestDb, user: {
  id: string
  email: string
  role?: 'viewer' | 'editor' | 'admin'
  githubId?: string
}) {
  await db.insert(schema.users).values({
    id: user.id,
    name: user.id,
    email: user.email,
    role: user.role ?? 'viewer',
    githubId: user.githubId ?? null
  })
}

export async function seedRecipe(db: TestDb, recipe: {
  id: string
  title: string
  visibility: 'public' | 'private'
  imageUrl?: string
  tags?: string[]
  source?: string
  date?: string
  steps?: Array<{ title: string, content: string }>
  ingredients?: Array<{ name: string, amount: string, unit: string, notes?: string, order: string }>
}) {
  await db.insert(schema.recipes).values({
    id: recipe.id,
    title: recipe.title,
    description: `${recipe.title} description`,
    imageUrl: recipe.imageUrl ?? null,
    date: new Date(recipe.date ?? '2026-01-01'),
    tags: recipe.tags ?? ['dinner'],
    source: recipe.source ?? null,
    servings: 4,
    estimatedMinutes: 30,
    steps: recipe.steps ?? [],
    visibility: recipe.visibility
  })
  for (const [index, ingredient] of (recipe.ingredients ?? []).entries()) {
    const ingredientId = `${recipe.id}-ing-${index}`
    await db.insert(schema.ingredients).values({ id: ingredientId, name: ingredient.name })
    await db.insert(schema.recipeIngredients).values({
      id: `${recipe.id}-ri-${index}`,
      recipeId: recipe.id,
      ingredientId,
      amount: ingredient.amount,
      unit: ingredient.unit,
      notes: ingredient.notes ?? null,
      order: ingredient.order
    })
  }
}
