import { eq, sql } from 'drizzle-orm'
import { db, schema } from '../db'
import { parseRecipeSource } from '~~/shared/utils/formatRecipeSource'

export interface RecipeSearchDocument {
  recipeId: string
  title: string
  description: string
  tags: string
  source: string
  book: string
  author: string
  ingredients: string
  steps: string
  contributor: string
}

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

  const parsedSource = parseRecipeSource(recipe.source)
  const steps = (recipe.steps || [])
    .map((step) => `${step.title || ''} ${step.content || ''}`.trim())
    .filter(Boolean)
    .join(' ')

  return {
    recipeId: recipe.id,
    title: recipe.title,
    description: recipe.description || '',
    tags: (recipe.tags || []).join(' '),
    source: recipe.source || '',
    book: parsedSource?.book || '',
    author: parsedSource?.author || '',
    ingredients: ingredientRows.map((row) => row.name).join(' '),
    steps,
    contributor
  }
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

export async function syncRecipeSearchIndex(recipeId: string) {
  if (!(await checkFtsAvailable())) return

  const doc = await buildRecipeSearchDocument(recipeId)
  if (!doc) {
    await deleteRecipeSearchIndex(recipeId)
    return
  }

  await upsertFtsDocument(doc)
  await invalidateSearchCache()
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
  // #region agent log
  const _dbgStartedAt = Date.now()
  // #endregion

  if (!(await checkFtsAvailable())) {
    return { indexed: 0, ftsAvailable: false, done: true, offset: 0, total: 0 }
  }

  const offset = Math.max(0, options?.offset ?? 0)
  const limit = options?.limit != null
    ? Math.min(Math.max(options.limit, 1), 100)
    : undefined

  // Full rebuild clears the index once at the start.
  if (offset === 0) {
    await db.run(sql`DELETE FROM recipes_fts`)
  }

  const recipes = await db.select({ id: schema.recipes.id }).from(schema.recipes)
  const total = recipes.length
  const slice = limit == null ? recipes.slice(offset) : recipes.slice(offset, offset + limit)
  let indexed = 0

  // #region agent log
  fetch('http://127.0.0.1:7596/ingest/f00dd2c9-dd1d-440f-a637-fdc99e4efb0a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4744c8'},body:JSON.stringify({sessionId:'4744c8',runId:'reindex-524',hypothesisId:'A',location:'recipeSearchIndex.ts:rebuild:start',message:'reindex batch start',data:{offset,limit:limit??null,total,sliceLen:slice.length,fullRebuild:limit==null},timestamp:Date.now()})}).catch(()=>{})
  // #endregion

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

  const durationMs = Date.now() - _dbgStartedAt
  // #region agent log
  fetch('http://127.0.0.1:7596/ingest/f00dd2c9-dd1d-440f-a637-fdc99e4efb0a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4744c8'},body:JSON.stringify({sessionId:'4744c8',runId:'reindex-524',hypothesisId:'C',location:'recipeSearchIndex.ts:rebuild:end',message:'reindex batch end',data:{offset,limit:limit??null,indexed,total,nextOffset,done,durationMs,msPerRecipe:indexed?Math.round(durationMs/indexed):null,wouldExceedCfTimeout:durationMs>=100000},timestamp:Date.now()})}).catch(()=>{})
  // #endregion

  return {
    indexed,
    ftsAvailable: true,
    offset,
    nextOffset,
    total,
    done,
    // Help operators see wall time without Cloudflare logs.
    durationMs
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
