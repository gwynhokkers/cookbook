import { eq, sql } from 'drizzle-orm'
import { db, schema } from '../db'
import {
  buildRecipeSearchDocumentFromAggregate,
  type RecipeSearchDocument
} from './recipeSearchDocument'

let ftsAvailable: boolean | null = null

async function checkFtsAvailable(): Promise<boolean> {
  if (ftsAvailable !== null) return ftsAvailable
  try {
    await db.run(sql`SELECT 1 FROM recipes_fts LIMIT 1`)
    ftsAvailable = true
  } catch {
    ftsAvailable = false
  }
  return ftsAvailable
}

export async function buildRecipeSearchDocument(recipeId: string): Promise<RecipeSearchDocument | null> {
  const rows = await db.select({
    id: schema.recipes.id,
    title: schema.recipes.title,
    description: schema.recipes.description,
    tags: schema.recipes.tags,
    source: schema.recipes.source,
    steps: schema.recipes.steps,
    authorId: schema.recipes.authorId
  })
    .from(schema.recipes)
    .where(eq(schema.recipes.id, recipeId))
    .limit(1)

  const recipe = rows[0]
  if (!recipe) return null

  const ingredientRows = await db.select({
    name: schema.ingredients.name
  })
    .from(schema.recipeIngredients)
    .innerJoin(schema.ingredients, eq(schema.recipeIngredients.ingredientId, schema.ingredients.id))
    .where(eq(schema.recipeIngredients.recipeId, recipeId))

  let contributor = ''
  if (recipe.authorId) {
    const userRows = await db.select({ name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, recipe.authorId))
      .limit(1)
    contributor = userRows[0]?.name || ''
  }

  return buildRecipeSearchDocumentFromAggregate({
    recipeId: recipe.id,
    title: recipe.title,
    description: recipe.description,
    tags: recipe.tags,
    source: recipe.source,
    steps: recipe.steps,
    ingredientNames: ingredientRows.map((row) => row.name),
    contributor
  })
}

async function upsertFtsDocument(doc: RecipeSearchDocument) {
  await db.run(sql`
    DELETE FROM recipes_fts WHERE recipe_id = ${doc.recipeId}
  `)
  await db.run(sql`
    INSERT INTO recipes_fts (
      recipe_id, title, description, tags, source, book, author, ingredients, steps, contributor
    ) VALUES (
      ${doc.recipeId},
      ${doc.title},
      ${doc.description},
      ${doc.tags},
      ${doc.source},
      ${doc.book},
      ${doc.author},
      ${doc.ingredients},
      ${doc.steps},
      ${doc.contributor}
    )
  `)
}

export async function upsertRecipeSearchDocument(
  doc: RecipeSearchDocument,
  options?: { invalidateCache?: boolean }
) {
  if (!(await checkFtsAvailable())) return

  await upsertFtsDocument(doc)
  if (options?.invalidateCache !== false) {
    await invalidateSearchCache()
  }
}

export async function syncRecipeSearchIndex(recipeId: string) {
  if (!(await checkFtsAvailable())) return

  const doc = await buildRecipeSearchDocument(recipeId)
  if (!doc) {
    await deleteRecipeSearchIndex(recipeId)
    return
  }

  await upsertRecipeSearchDocument(doc)
}

export async function deleteRecipeSearchIndex(recipeId: string) {
  if (!(await checkFtsAvailable())) return

  await db.run(sql`DELETE FROM recipes_fts WHERE recipe_id = ${recipeId}`)
  await invalidateSearchCache()
}

export async function rebuildRecipeSearchIndex(options?: {
  offset?: number
  limit?: number
}) {
  const startedAt = Date.now()

  if (!(await checkFtsAvailable())) {
    return { indexed: 0, ftsAvailable: false, done: true, offset: 0, total: 0 }
  }

  const offset = Math.max(0, options?.offset ?? 0)
  const limit = options?.limit != null
    ? Math.min(Math.max(options.limit, 1), 100)
    : undefined

  const recipes = await db.select({ id: schema.recipes.id }).from(schema.recipes)
  const total = recipes.length

  // Full rebuild in one SQL statement — avoids hundreds of D1 round-trips that
  // exceed Cloudflare's ~125s proxy read timeout (error 524) on large cookbooks.
  if (limit == null && offset === 0) {
    await db.run(sql`DELETE FROM recipes_fts`)
    await db.run(sql`
      INSERT INTO recipes_fts (
        recipe_id, title, description, tags, source, book, author, ingredients, steps, contributor
      )
      SELECT
        r.id,
        r.title,
        COALESCE(r.description, ''),
        COALESCE(r.tags, ''),
        COALESCE(r.source, ''),
        '',
        '',
        COALESCE((
          SELECT group_concat(i.name, ' ')
          FROM recipe_ingredients ri
          JOIN ingredients i ON i.id = ri.ingredient_id
          WHERE ri.recipe_id = r.id
        ), ''),
        COALESCE(r.steps, ''),
        COALESCE(u.name, '')
      FROM recipes r
      LEFT JOIN users u ON u.id = r.author_id
    `)
    await invalidateSearchCache()

    return {
      indexed: total,
      ftsAvailable: true,
      offset: 0,
      nextOffset: total,
      total,
      done: true,
      durationMs: Date.now() - startedAt,
      mode: 'bulk' as const
    }
  }

  // Batched / incremental path (per-recipe documents with parsed book/author).
  if (offset === 0) {
    await db.run(sql`DELETE FROM recipes_fts`)
  }

  const slice = recipes.slice(offset, offset + (limit ?? recipes.length))
  let indexed = 0

  for (const recipe of slice) {
    const doc = await buildRecipeSearchDocument(recipe.id)
    if (doc) {
      await upsertFtsDocument(doc)
      indexed++
    }
  }

  const nextOffset = offset + slice.length
  const done = nextOffset >= total

  if (done) {
    await invalidateSearchCache()
  }

  return {
    indexed,
    ftsAvailable: true,
    offset,
    nextOffset,
    total,
    done,
    durationMs: Date.now() - startedAt,
    mode: 'batch' as const
  }
}

export async function isRecipeFtsAvailable() {
  return checkFtsAvailable()
}

const SEARCH_CACHE_VERSION_KEY = 'search:version'

async function getKv() {
  try {
    // @ts-expect-error hub:kv is resolved by NuxtHub at runtime
    const { kv } = await import('hub:kv')
    return kv
  } catch {
    return null
  }
}

export async function invalidateSearchCache() {
  const kv = await getKv()
  if (!kv) return

  const current = Number(await kv.get(SEARCH_CACHE_VERSION_KEY) || 0)
  await kv.set(SEARCH_CACHE_VERSION_KEY, String(current + 1))
}

export async function getSearchCacheVersion(): Promise<string> {
  const kv = await getKv()
  if (!kv) return '0'
  return String((await kv.get(SEARCH_CACHE_VERSION_KEY)) || '0')
}

export async function getCachedSearchResults<T>(key: string): Promise<T | null> {
  const kv = await getKv()
  if (!kv) return null

  const cached = await kv.get<T>(key)
  return cached ?? null
}

export async function setCachedSearchResults(key: string, value: unknown) {
  const kv = await getKv()
  if (!kv) return

  await kv.set(key, value, { ttl: 300 })
}

export function buildSearchCacheKey(
  version: string,
  signedIn: boolean,
  scope: string,
  favoritesFingerprint: string,
  query: string,
  limit: number
) {
  return `search:v${version}:${signedIn ? 'auth' : 'guest'}:${scope}:${favoritesFingerprint}:${query.toLowerCase()}:${limit}`
}
