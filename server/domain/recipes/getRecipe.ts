import { and, eq, sql } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { visibleTo, type CookbookDb, type Viewer } from './types'

/** The stored recipe row, or `null` if it doesn't exist or the viewer can't see it. */
export async function findRecipe(db: CookbookDb, recipeId: string, viewer: Viewer) {
  const [recipe] = await db.select()
    .from(schema.recipes)
    .where(and(eq(schema.recipes.id, recipeId), visibleTo(viewer)))
    .limit(1)
  return recipe ?? null
}

/** The recipe with its ingredients (in order) and steps, or `null` like `findRecipe`. */
export async function getRecipe(db: CookbookDb, recipeId: string, viewer: Viewer) {
  const recipe = await findRecipe(db, recipeId, viewer)
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
