import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db, schema } from '../db'
import { toRecipeTitleCase } from '~~/shared/utils/recipeTitle'
import { normalizeServingsForStorage } from '~~/shared/utils/parseServings'
import { normalizeEstimatedMinutes } from '~~/shared/utils/formatEstimatedMinutes'
import { buildRecipeSearchDocumentFromAggregate } from './recipeSearchDocument'
import {
  syncRecipeSearchIndex,
  upsertRecipeSearchDocument
} from './recipeSearchIndex'
import {
  normalizePersistIngredients,
  normalizePersistSteps,
  type NormalizedPersistIngredient,
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
  /** Display name for FTS contributor field when known (e.g. session user name). */
  contributor?: string | null
  date?: Date
  ingredients?: PersistIngredientInput[]
}

/**
 * Partial metadata update. When `ingredients` is present (including `[]`),
 * recipe_ingredient rows are **fully replaced** with that list. Omit `ingredients`
 * to leave links unchanged (metadata-only / legacy clients).
 */
export type PersistRecipeUpdateInput = {
  title?: string
  description?: string | null
  imageUrl?: string | null
  tags?: string[]
  source?: string | null
  servings?: number | null
  estimatedMinutes?: number | null
  steps?: Array<{ title?: string; content?: string }>
  visibility?: 'public' | 'private'
  date?: Date
  /** Claim authorship when recipe.authorId is currently null. */
  claimAuthorId?: string | null
  contributor?: string | null
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

export type PersistRecipeRow = {
  id: string
  title: string
  description: string | null
  imageUrl: string | null
  date: Date
  tags: string[]
  source: string | null
  servings: number | null
  estimatedMinutes: number | null
  steps: Array<{ title: string; content: string }>
  visibility: 'public' | 'private'
  authorId: string | null
  createdAt: Date
  updatedAt: Date
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
  recipe?: PersistRecipeRow
}

export type PersistRecipeUpdateResult = {
  id: string
  recipe: PersistRecipeRow
  ingredientCount: number
  ingredientsReplaced: boolean
}

type IngredientRef = { id: string; name: string }

async function applySpoonacularUpdate(
  ingredientId: string,
  row: NormalizedPersistIngredient
) {
  if (row.spoonacularIngredientId === undefined && row.spoonacularData === undefined) {
    return
  }
  const updateData: {
    updatedAt: Date
    spoonacularIngredientId?: string | null
    spoonacularData?: Record<string, unknown> | null
  } = { updatedAt: new Date() }
  if (row.spoonacularIngredientId !== undefined) {
    updateData.spoonacularIngredientId = row.spoonacularIngredientId
  }
  if (row.spoonacularData !== undefined) {
    updateData.spoonacularData = row.spoonacularData
  }
  await db.update(schema.ingredients)
    .set(updateData)
    .where(eq(schema.ingredients.id, ingredientId))
}

async function findOrCreateIngredientByName(
  row: NormalizedPersistIngredient,
  cache: Map<string, IngredientRef>
): Promise<IngredientRef> {
  const name = row.ingredientName
  const cached = cache.get(name)
  if (cached) {
    await applySpoonacularUpdate(cached.id, row)
    return cached
  }

  const existing = await db.select({
    id: schema.ingredients.id,
    name: schema.ingredients.name
  })
    .from(schema.ingredients)
    .where(eq(schema.ingredients.name, name))
    .limit(1)

  if (existing[0]) {
    await applySpoonacularUpdate(existing[0].id, row)
    cache.set(name, existing[0])
    return existing[0]
  }

  const id = nanoid()
  const now = new Date()
  const created = { id, name }
  await db.insert(schema.ingredients).values({
    id,
    name,
    spoonacularIngredientId: row.spoonacularIngredientId ?? null,
    spoonacularData: row.spoonacularData ?? null,
    createdAt: now,
    updatedAt: now
  })
  cache.set(name, created)
  return created
}

async function resolveIngredient(
  row: NormalizedPersistIngredient,
  cache: Map<string, IngredientRef>
): Promise<IngredientRef> {
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
    await applySpoonacularUpdate(byId[0].id, row)
    cache.set(byId[0].name, byId[0])
    return byId[0]
  }

  return findOrCreateIngredientByName(row, cache)
}

async function replaceRecipeIngredientLinks(
  recipeId: string,
  ingredientRows: NormalizedPersistIngredient[],
  now: Date
): Promise<{ linked: PersistLinkedIngredient[]; ingredientNames: string[] }> {
  await db.delete(schema.recipeIngredients)
    .where(eq(schema.recipeIngredients.recipeId, recipeId))

  const nameCache = new Map<string, IngredientRef>()
  const linked: PersistLinkedIngredient[] = []
  const ingredientNames: string[] = []

  for (const row of ingredientRows) {
    const ingredient = await resolveIngredient(row, nameCache)
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

  return { linked, ingredientNames }
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
  const description = input.description ? String(input.description).trim() : null
  const imageUrl = input.imageUrl || null
  const servings = normalizeServingsForStorage(input.servings)
  const estimatedMinutes = normalizeEstimatedMinutes(input.estimatedMinutes)
  const authorId = input.authorId ?? null

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

  const recipe: PersistRecipeRow = {
    id: recipeId,
    title,
    description,
    imageUrl,
    date: now,
    tags,
    source,
    servings,
    estimatedMinutes,
    steps,
    visibility,
    authorId,
    createdAt: now,
    updatedAt: now
  }

  await db.insert(schema.recipes).values(recipe)

  const { linked, ingredientNames } = await replaceRecipeIngredientLinks(
    recipeId,
    ingredientRows,
    now
  )

  const doc = buildRecipeSearchDocumentFromAggregate({
    recipeId,
    title,
    description,
    tags,
    source,
    steps,
    ingredientNames,
    contributor: input.contributor || ''
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
    linked,
    recipe
  }
}

function mapRecipeRow(row: typeof schema.recipes.$inferSelect): PersistRecipeRow {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    date: row.date,
    tags: row.tags || [],
    source: row.source,
    servings: row.servings ?? null,
    estimatedMinutes: row.estimatedMinutes ?? null,
    steps: row.steps || [],
    visibility: row.visibility === 'private' ? 'private' : 'public',
    authorId: row.authorId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

/**
 * Update recipe metadata and optionally **fully replace** ingredient links.
 * Full replace when `input.ingredients` is defined (including empty array).
 */
export async function updatePersistRecipe(
  recipeId: string,
  input: PersistRecipeUpdateInput,
  options: PersistOptions = {}
): Promise<PersistRecipeUpdateResult> {
  const existingRows = await db.select()
    .from(schema.recipes)
    .where(eq(schema.recipes.id, recipeId))
    .limit(1)

  const existing = existingRows[0]
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Recipe not found'
    })
  }

  const now = new Date()
  const updateData: Record<string, unknown> = {
    updatedAt: now
  }

  if (existing.authorId === null && input.claimAuthorId) {
    updateData.authorId = input.claimAuthorId
  }

  if (input.title !== undefined) {
    const title = toRecipeTitleCase(String(input.title).trim())
    if (!title) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Title is required'
      })
    }
    updateData.title = title
  }
  if (input.description !== undefined) updateData.description = input.description
  if (input.imageUrl !== undefined) updateData.imageUrl = input.imageUrl
  if (input.date !== undefined) updateData.date = input.date
  if (input.tags !== undefined) updateData.tags = input.tags
  if (input.source !== undefined) {
    updateData.source = input.source != null ? String(input.source).trim() : null
  }
  if (input.servings !== undefined) {
    updateData.servings = normalizeServingsForStorage(input.servings)
  }
  if (input.estimatedMinutes !== undefined) {
    updateData.estimatedMinutes = normalizeEstimatedMinutes(input.estimatedMinutes)
  }
  if (input.steps !== undefined) {
    updateData.steps = normalizePersistSteps(input.steps)
  }
  if (input.visibility !== undefined) {
    updateData.visibility = input.visibility === 'private' ? 'private' : 'public'
  }

  await db.update(schema.recipes)
    .set(updateData)
    .where(eq(schema.recipes.id, recipeId))

  const ingredientsReplaced = input.ingredients !== undefined
  let ingredientCount = 0
  let ingredientNames: string[] | null = null

  if (ingredientsReplaced) {
    const ingredientRows = normalizePersistIngredients(input.ingredients)
    const replaced = await replaceRecipeIngredientLinks(recipeId, ingredientRows, now)
    ingredientCount = replaced.linked.length
    ingredientNames = replaced.ingredientNames
  }

  const updatedRows = await db.select()
    .from(schema.recipes)
    .where(eq(schema.recipes.id, recipeId))
    .limit(1)

  const recipe = mapRecipeRow(updatedRows[0]!)

  if (ingredientsReplaced && ingredientNames) {
    let contributor = input.contributor || ''
    if (!contributor && recipe.authorId) {
      const userRows = await db.select({ name: schema.users.name })
        .from(schema.users)
        .where(eq(schema.users.id, recipe.authorId))
        .limit(1)
      contributor = userRows[0]?.name || ''
    }

    const doc = buildRecipeSearchDocumentFromAggregate({
      recipeId,
      title: recipe.title,
      description: recipe.description,
      tags: recipe.tags,
      source: recipe.source,
      steps: recipe.steps,
      ingredientNames,
      contributor
    })
    await upsertRecipeSearchDocument(doc, {
      invalidateCache: options.invalidateSearchCache !== false
    })
  } else {
    // Metadata-only: reload FTS from DB so ingredient text stays accurate.
    await syncRecipeSearchIndex(recipeId)
  }

  if (!ingredientsReplaced) {
    const countRows = await db.select({ id: schema.recipeIngredients.id })
      .from(schema.recipeIngredients)
      .where(eq(schema.recipeIngredients.recipeId, recipeId))
    ingredientCount = countRows.length
  }

  return {
    id: recipeId,
    recipe,
    ingredientCount,
    ingredientsReplaced
  }
}
