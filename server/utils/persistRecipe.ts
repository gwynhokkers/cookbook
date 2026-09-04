import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db, schema } from '../db'
import { toRecipeTitleCase } from '~~/shared/utils/recipeTitle'
import { normalizeServingsForStorage } from '~~/shared/utils/parseServings'
import { normalizeEstimatedMinutes } from '~~/shared/utils/formatEstimatedMinutes'
import { buildRecipeSearchDocumentFromAggregate } from './recipeSearchDocument'
import { upsertRecipeSearchDocument } from './recipeSearchIndex'
import {
  normalizePersistIngredients,
  normalizePersistSteps,
  type PersistIngredientInput
} from './persistRecipeNormalize'

export type PersistRecipeCreateInput = {
  title: string
  description?: string | null
  imageUrl?: string | null
  tags?: string[]
  source?: string | null
  servings?: number | null
  estimatedMinutes?: number | null
  steps?: Array<{ title?: string; content?: string }>
  visibility: 'public' | 'private'
  authorId?: string | null
  date?: Date
  ingredients?: PersistIngredientInput[]
}

export type PersistOptions = {
  /**
   * Default true. Import batches may pass false and call invalidateSearchCache once at end.
   * Caller must invalidate later when false.
   */
  invalidateSearchCache?: boolean
  /** Import: if title+source exists, return skipped instead of creating */
  skipIfDuplicateSourceTitle?: boolean
}

export type PersistLinkedIngredient = {
  id: string
  ingredientId: string
  ingredientName: string
  amount: string
  unit: string
}

export type PersistRecipeCreateResult = {
  skipped: boolean
  id: string
  title: string
  source: string | null
  visibility: 'public' | 'private'
  ingredientCount: number
  stepCount: number
  linked?: PersistLinkedIngredient[]
}

async function findOrCreateIngredientByName(
  name: string,
  cache: Map<string, { id: string; name: string }>
) {
  const cached = cache.get(name)
  if (cached) return cached

  const existing = await db.select({
    id: schema.ingredients.id,
    name: schema.ingredients.name
  })
    .from(schema.ingredients)
    .where(eq(schema.ingredients.name, name))
    .limit(1)

  if (existing[0]) {
    cache.set(name, existing[0])
    return existing[0]
  }

  const id = nanoid()
  const now = new Date()
  const created = { id, name }
  await db.insert(schema.ingredients).values({
    id,
    name,
    spoonacularIngredientId: null,
    spoonacularData: null,
    createdAt: now,
    updatedAt: now
  })
  cache.set(name, created)
  return created
}

/**
 * Persist a recipe aggregate (metadata + ingredients + FTS) in one module.
 * Routes and import scripts are adapters over this seam.
 */
export async function createPersistRecipe(
  input: PersistRecipeCreateInput,
  options: PersistOptions = {}
): Promise<PersistRecipeCreateResult> {
  const title = toRecipeTitleCase(String(input.title || '').trim())
  if (!title) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Title is required'
    })
  }

  const source = input.source != null ? String(input.source).trim() : null
  if (options.skipIfDuplicateSourceTitle && !source) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Source is required (e.g. book title and author)'
    })
  }

  const visibility = input.visibility === 'public' ? 'public' : 'private'
  const tags = Array.isArray(input.tags)
    ? input.tags.map((t) => String(t).trim()).filter(Boolean)
    : []
  const steps = normalizePersistSteps(input.steps)
  const ingredientRows = normalizePersistIngredients(input.ingredients)

  if (options.skipIfDuplicateSourceTitle && source) {
    const duplicates = await db.select({
      id: schema.recipes.id,
      title: schema.recipes.title,
      source: schema.recipes.source
    })
      .from(schema.recipes)
      .where(and(
        eq(schema.recipes.title, title),
        eq(schema.recipes.source, source)
      ))
      .limit(1)

    if (duplicates[0]) {
      return {
        skipped: true,
        id: duplicates[0].id,
        title: duplicates[0].title,
        source: duplicates[0].source,
        visibility,
        ingredientCount: 0,
        stepCount: 0
      }
    }
  }

  const recipeId = nanoid()
  const now = input.date ?? new Date()

  await db.insert(schema.recipes).values({
    id: recipeId,
    title,
    description: input.description ? String(input.description).trim() : null,
    imageUrl: input.imageUrl || null,
    date: now,
    tags,
    source,
    servings: normalizeServingsForStorage(input.servings),
    estimatedMinutes: normalizeEstimatedMinutes(input.estimatedMinutes),
    steps,
    visibility,
    authorId: input.authorId ?? null,
    createdAt: now,
    updatedAt: now
  })

  const nameCache = new Map<string, { id: string; name: string }>()
  const linked: PersistLinkedIngredient[] = []
  const ingredientNames: string[] = []

  for (const row of ingredientRows) {
    let ingredient: { id: string; name: string }

    if (row.ingredientId) {
      const byId = await db.select({
        id: schema.ingredients.id,
        name: schema.ingredients.name
      })
        .from(schema.ingredients)
        .where(eq(schema.ingredients.id, row.ingredientId))
        .limit(1)

      if (!byId[0]) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Ingredient not found'
        })
      }
      ingredient = byId[0]
      nameCache.set(ingredient.name, ingredient)
    } else {
      ingredient = await findOrCreateIngredientByName(row.ingredientName, nameCache)
    }

    const recipeIngredientId = nanoid()
    await db.insert(schema.recipeIngredients).values({
      id: recipeIngredientId,
      recipeId,
      ingredientId: ingredient.id,
      amount: row.amount,
      unit: row.unit,
      notes: row.notes,
      order: row.order,
      createdAt: now,
      updatedAt: now
    })

    linked.push({
      id: recipeIngredientId,
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      amount: row.amount,
      unit: row.unit
    })
    ingredientNames.push(ingredient.name)
  }

  const doc = buildRecipeSearchDocumentFromAggregate({
    recipeId,
    title,
    description: input.description ? String(input.description).trim() : null,
    tags,
    source,
    steps,
    ingredientNames,
    contributor: ''
  })

  await upsertRecipeSearchDocument(doc, {
    invalidateCache: options.invalidateSearchCache !== false
  })

  return {
    skipped: false,
    id: recipeId,
    title,
    source,
    visibility,
    ingredientCount: linked.length,
    stepCount: steps.length,
    linked
  }
}
