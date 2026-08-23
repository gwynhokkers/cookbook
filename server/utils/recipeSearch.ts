import { and, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '../db'
import { parseRecipeSource } from '~~/shared/utils/formatRecipeSource'
import {
  buildSearchCacheKey,
  getCachedSearchResults,
  getSearchCacheVersion,
  isRecipeFtsAvailable,
  setCachedSearchResults
} from './recipeSearchIndex'
import type { RecipeSearchResult, SearchMatchField } from '~~/shared/utils/recipeSearchTypes'

interface SearchOptions {
  query: string
  limit?: number
  signedIn: boolean
  scope?: 'all' | 'favorites'
  favoriteRecipeIds?: string[]
  favoritesFingerprint?: string
}

const FAVORITE_SEARCH_BOOST = 75

function getRestrictToRecipeIds(options: SearchOptions) {
  if (options.scope === 'favorites') {
    return options.favoriteRecipeIds || []
  }
  return undefined
}

function finalizeSearchResults(results: RecipeSearchResult[], options: SearchOptions) {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50)
  let next = results

  if (options.scope === 'favorites') {
    const favoriteSet = new Set(options.favoriteRecipeIds || [])
    next = next.filter((result) => favoriteSet.has(result.id))
  } else if (options.favoriteRecipeIds?.length) {
    const favoriteSet = new Set(options.favoriteRecipeIds)
    next = next.map((result) => ({
      ...result,
      score: favoriteSet.has(result.id) ? result.score + FAVORITE_SEARCH_BOOST : result.score
    }))
  }

  return next
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

function escapeFtsToken(token: string) {
  return `"${token.replace(/"/g, '""')}"`
}

export function toFtsQuery(query: string) {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeFtsToken)
    .join(' OR ')
}

function includesTerm(haystack: string | null | undefined, term: string) {
  return (haystack || '').toLowerCase().includes(term)
}

async function loadIngredientNamesByRecipe(recipeIds: string[]) {
  const map = new Map<string, string[]>()
  if (!recipeIds.length) return map

  const rows = await db.select({
    recipeId: schema.recipeIngredients.recipeId,
    name: schema.ingredients.name
  })
    .from(schema.recipeIngredients)
    .innerJoin(schema.ingredients, eq(schema.recipeIngredients.ingredientId, schema.ingredients.id))
    .where(inArray(schema.recipeIngredients.recipeId, recipeIds))

  for (const row of rows) {
    const current = map.get(row.recipeId) || []
    current.push(row.name)
    map.set(row.recipeId, current)
  }

  return map
}

async function loadContributorNames(authorIds: string[]) {
  const map = new Map<string, string>()
  const uniqueIds = [...new Set(authorIds.filter(Boolean))]
  if (!uniqueIds.length) return map

  const rows = await db.select({
    id: schema.users.id,
    name: schema.users.name
  })
    .from(schema.users)
    .where(inArray(schema.users.id, uniqueIds))

  for (const row of rows) {
    map.set(row.id, row.name || '')
  }

  return map
}

function scoreFallbackMatch(
  recipe: {
    title: string
    description: string | null
    tags: string[] | null
    source: string | null
    steps: Array<{ title: string; content: string }> | null
    contributor: string
    ingredients: string[]
  },
  terms: string[]
) {
  const matchedOn = new Set<SearchMatchField>()
  let score = 0

  for (const term of terms) {
    if (includesTerm(recipe.title, term)) {
      matchedOn.add('title')
      score += 100
    }

    for (const ingredient of recipe.ingredients) {
      if (includesTerm(ingredient, term)) {
        matchedOn.add('ingredient')
        score += 60
        break
      }
    }

    for (const tag of recipe.tags || []) {
      if (includesTerm(tag, term)) {
        matchedOn.add('tag')
        score += 40
        break
      }
    }

    const parsedSource = parseRecipeSource(recipe.source)
    if (
      includesTerm(recipe.source, term)
      || includesTerm(parsedSource?.book, term)
      || includesTerm(parsedSource?.author, term)
    ) {
      matchedOn.add('source')
      score += 35
    }

    if (includesTerm(recipe.contributor, term)) {
      matchedOn.add('contributor')
      score += 25
    }

    if (includesTerm(recipe.description, term)) {
      matchedOn.add('description')
      score += 20
    }

    for (const step of recipe.steps || []) {
      if (includesTerm(step.title, term) || includesTerm(step.content, term)) {
        matchedOn.add('step')
        score += 15
        break
      }
    }
  }

  return { score, matchedOn: [...matchedOn] }
}

function buildSnippet(
  recipe: {
    title: string
    description: string | null
    source: string | null
    ingredients: string[]
    tags: string[] | null
  },
  matchedOn: SearchMatchField[]
) {
  if (matchedOn.includes('ingredient')) {
    return recipe.ingredients.slice(0, 3).join(', ')
  }
  if (matchedOn.includes('source') && recipe.source) {
    const parsed = parseRecipeSource(recipe.source)
    if (parsed?.book) {
      return parsed.author ? `${parsed.book} — ${parsed.author}` : parsed.book
    }
    return recipe.source
  }
  if (matchedOn.includes('tag') && recipe.tags?.length) {
    return recipe.tags.slice(0, 4).join(', ')
  }
  if (recipe.description) {
    return recipe.description.length > 120
      ? `${recipe.description.slice(0, 117)}...`
      : recipe.description
  }
  return recipe.title
}

async function searchWithFts(options: SearchOptions): Promise<RecipeSearchResult[]> {
  const limit = options.limit ?? 20
  const ftsQuery = toFtsQuery(options.query)
  if (!ftsQuery) return []

  const restrictToRecipeIds = getRestrictToRecipeIds(options)
  if (restrictToRecipeIds && restrictToRecipeIds.length === 0) {
    return []
  }

  const visibilityClause = options.signedIn
    ? sql`1 = 1`
    : sql`r.visibility = 'public'`

  const favoriteFilter = restrictToRecipeIds?.length
    ? sql`AND recipes_fts.recipe_id IN (${sql.join(restrictToRecipeIds.map((id) => sql`${id}`), sql`, `)})`
    : sql``

  const rows = await db.all(sql`
    SELECT
      r.id,
      r.title,
      r.description,
      r.image_url AS imageUrl,
      r.tags,
      r.source,
      r.visibility,
      bm25(recipes_fts) AS rank
    FROM recipes_fts
    JOIN recipes r ON recipes_fts.recipe_id = r.id
    WHERE recipes_fts MATCH ${ftsQuery}
      AND ${visibilityClause}
      ${favoriteFilter}
    ORDER BY rank
    LIMIT ${Math.max(limit, 50)}
  `) as Array<{
    id: string
    title: string
    description: string | null
    imageUrl: string | null
    tags: string | string[] | null
    source: string | null
    visibility: string
    rank: number
  }>

  const terms = options.query.toLowerCase().split(/\s+/).filter(Boolean)
  const recipeIds = rows.map((row) => row.id)

  const recipeRowsById = new Map<string, { steps: Array<{ title: string; content: string }> | null, authorId: string | null }>()
  if (recipeIds.length) {
    const recipeMeta = await db.select({
      id: schema.recipes.id,
      steps: schema.recipes.steps,
      authorId: schema.recipes.authorId
    })
      .from(schema.recipes)
      .where(inArray(schema.recipes.id, recipeIds))

    for (const recipe of recipeMeta) {
      recipeRowsById.set(recipe.id, { steps: recipe.steps, authorId: recipe.authorId })
    }
  }

  const ingredientsByRecipe = await loadIngredientNamesByRecipe(recipeIds)
  const contributors = await loadContributorNames(
    [...recipeRowsById.values()].map((meta) => meta.authorId).filter(Boolean) as string[]
  )

  const results: RecipeSearchResult[] = []

  for (const row of rows) {
    const tags = Array.isArray(row.tags)
      ? row.tags
      : typeof row.tags === 'string'
        ? JSON.parse(row.tags || '[]')
        : []

    const meta = recipeRowsById.get(row.id)
    const contributor = meta?.authorId ? (contributors.get(meta.authorId) || '') : ''
    const ingredients = ingredientsByRecipe.get(row.id) || []

    const fallback = scoreFallbackMatch(
      {
        title: row.title,
        description: row.description,
        tags,
        source: row.source,
        steps: meta?.steps || [],
        contributor,
        ingredients
      },
      terms
    )

    results.push({
      id: row.id,
      title: row.title,
      description: row.description,
      imageUrl: row.imageUrl,
      tags,
      source: row.source,
      visibility: row.visibility,
      matchedOn: fallback.matchedOn.length ? fallback.matchedOn : ['title'],
      snippet: buildSnippet(
        {
          title: row.title,
          description: row.description,
          source: row.source,
          ingredients,
          tags
        },
        fallback.matchedOn.length ? fallback.matchedOn : ['title']
      ),
      score: fallback.score || Math.abs(Number(row.rank) || 0)
    })
  }

  return finalizeSearchResults(
    results.sort((a, b) => b.score - a.score),
    options
  )
}

async function searchWithFallback(options: SearchOptions): Promise<RecipeSearchResult[]> {
  const limit = options.limit ?? 20
  const terms = options.query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []

  const restrictToRecipeIds = getRestrictToRecipeIds(options)
  if (restrictToRecipeIds && restrictToRecipeIds.length === 0) {
    return []
  }

  const conditions = []
  if (!options.signedIn) {
    conditions.push(eq(schema.recipes.visibility, 'public'))
  }
  if (restrictToRecipeIds?.length) {
    conditions.push(inArray(schema.recipes.id, restrictToRecipeIds))
  }

  let recipeQuery = db.select().from(schema.recipes)
  if (conditions.length) {
    recipeQuery = recipeQuery.where(and(...conditions))
  }

  const recipes = await recipeQuery
  const ingredientsByRecipe = await loadIngredientNamesByRecipe(recipes.map((recipe) => recipe.id))
  const contributors = await loadContributorNames(
    recipes.map((recipe) => recipe.authorId).filter(Boolean) as string[]
  )
  const results: RecipeSearchResult[] = []

  for (const recipe of recipes) {
    const ingredients = ingredientsByRecipe.get(recipe.id) || []
    const contributor = recipe.authorId ? (contributors.get(recipe.authorId) || '') : ''

    const { score, matchedOn } = scoreFallbackMatch(
      {
        title: recipe.title,
        description: recipe.description,
        tags: recipe.tags || [],
        source: recipe.source,
        steps: recipe.steps || [],
        contributor,
        ingredients
      },
      terms
    )

    if (!score) continue

    results.push({
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      imageUrl: recipe.imageUrl,
      tags: recipe.tags || [],
      source: recipe.source,
      visibility: recipe.visibility,
      matchedOn,
      snippet: buildSnippet(
        {
          title: recipe.title,
          description: recipe.description,
          source: recipe.source,
          ingredients,
          tags: recipe.tags || []
        },
        matchedOn
      ),
      score
    })
  }

  return finalizeSearchResults(results, options)
}

export async function searchRecipes(options: SearchOptions): Promise<RecipeSearchResult[]> {
  const trimmed = options.query.trim()
  if (trimmed.length < 2) return []

  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50)
  const scope = options.scope || 'all'
  const favoritesFingerprint = options.favoritesFingerprint || 'none'
  const cacheVersion = await getSearchCacheVersion()
  const cacheKey = buildSearchCacheKey(
    cacheVersion,
    options.signedIn,
    scope,
    favoritesFingerprint,
    trimmed,
    limit
  )
  const cached = await getCachedSearchResults<RecipeSearchResult[]>(cacheKey)
  if (cached) return cached

  const ftsAvailable = await isRecipeFtsAvailable()
  let results: RecipeSearchResult[] = []

  if (ftsAvailable) {
    try {
      results = await searchWithFts({ ...options, limit })
    } catch {
      results = []
    }
  }

  // FTS can exist but be empty/unindexed after migration, or throw on MATCH.
  // Fall back to LIKE search so site search / Humphry still return recipes.
  if (!ftsAvailable || results.length === 0) {
    results = await searchWithFallback({ ...options, limit })
  }

  if (results.length > 0) {
    await setCachedSearchResults(cacheKey, results)
  }
  return results
}
