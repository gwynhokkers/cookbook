import { and, eq, sql } from 'drizzle-orm'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import * as schema from '../../server/db/schema'

export type CookbookDb = BaseSQLiteDatabase<'sync' | 'async', unknown, typeof schema>

// Keep in step with viewRecipe in shared/utils/abilities.ts: guests see public recipes, signed-in users see all.
export async function getRecipe(db: CookbookDb, recipeId: string, user: { id: string } | null) {
  const [recipe] = await db.select()
    .from(schema.recipes)
    .where(user
      ? eq(schema.recipes.id, recipeId)
      : and(eq(schema.recipes.id, recipeId), eq(schema.recipes.visibility, 'public')))
    .limit(1)

  if (!recipe) return null

  const ingredients = await db.select({
    name: schema.ingredients.name,
    amount: schema.recipeIngredients.amount,
    unit: schema.recipeIngredients.unit,
    notes: schema.recipeIngredients.notes
  })
    .from(schema.recipeIngredients)
    .innerJoin(schema.ingredients, eq(schema.recipeIngredients.ingredientId, schema.ingredients.id))
    .where(eq(schema.recipeIngredients.recipeId, recipeId))
    .orderBy(sql`CAST(${schema.recipeIngredients.order} AS INTEGER)`)

  return {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    imageUrl: recipe.imageUrl,
    tags: recipe.tags ?? [],
    servings: recipe.servings,
    estimatedMinutes: recipe.estimatedMinutes,
    source: recipe.source,
    sourceUrl: recipe.sourceUrl,
    ingredients,
    steps: recipe.steps ?? []
  }
}

export type CookbookRecipe = NonNullable<Awaited<ReturnType<typeof getRecipe>>>
