import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { db, schema } from '../db'
import { parseRecipeSource } from '~~/shared/utils/formatRecipeSource'
import {
  type RecipeSearchFilters,
  clampSearchPage
} from '~~/shared/utils/recipeSearchFilters'
import type {
  PaginatedRecipeSearchResults,
  RecipeSearchResult,
  SearchMatchField
} from '~~/shared/utils/recipeSearchTypes'
import { emptyPaginatedSearchResults } from '~~/shared/utils/recipeSearchTypes'
import {
  buildJsonTagsOrMatchSql,
  buildSourcesOrMatchSql,
  buildTimeFilterSql
} from './recipeSearchFilters'
import {
  buildSearchCacheKey,
  getCachedSearchResults,
  getSearchCacheVersion,
  isRecipeFtsAvailable,
  setCachedSearchResults
} from './recipeSearchIndex'

interface SearchOptions {
  query: string
  limit?: number
  signedIn: boolean
  scope?: 'all' | 'favorites'
  favoriteRecipeIds?: string[]
  favoritesFingerprint?: string
}

export interface QueryRecipeSearchOptions {
  query?: string
  filters?: RecipeSearchFilters
  page?: number
  pageSize?: number
  signedIn: boolean
  scope?: 'all' | 'favorites'
  favoriteRecipeIds?: string[]
  favoritesFingerprint?: string
}

const FAVORITE_SEARCH_BOOST = 75
const EMPTY_FILTERS: RecipeSearchFilters = { tags: [], sources: [], diet: [], time: null }

function getRestrictToRecipeIds(scope: 'all' | 'favorites', favoriteRecipeIds?: string[]) {
  if (scope === 'favorites') {
    return favoriteRecipeIds || []
  }
  return undefined
}

function parseTagsField(tags: string | string[] | null | undefined): string[] {
  if (Array.isArray(tags)) return tags
  if (typeof tags === 'string') {
    try {
      return JSON.parse(tags || '[]')
    } catch {
      return []
    }
  }
  return []
}

function buildBaseWhereClauses(
  signedIn: boolean,
  restrictToRecipeIds: string[] | undefined,
  filters: RecipeSearchFilters
): SQL[] {
  const clauses: SQL[] = []

  if (!signedIn) {
    clauses.push(sql`r.visibility = 'public'`)
  }

  if (restrictToRecipeIds?.length) {
    clauses.push(sql`r.id IN (${sql.join(restrictToRecipeIds.map((id) => sql`${id}`), sql`, `)})`)
  }

  const tagsClause = buildJsonTagsOrMatchSql(sql`r.tags`, filters.tags)
  if (tagsClause) clauses.push(tagsClause)

  const sourcesClause = buildSourcesOrMatchSql(filters.sources)
  if (sourcesClause) clauses.push(sourcesClause)

  const dietClause = buildJsonTagsOrMatchSql(sql`r.tags`, filters.diet)
  if (dietClause) clauses.push(dietClause)

  const timeClause = buildTimeFilterSql(filters.time)
  if (timeClause) clauses.push(timeClause)

  return clauses
}

function combineWhere(clauses: SQL[]): SQL {
  if (!clauses.length) return sql`1 = 1`
  return sql.join(clauses.map((clause) => sql`(${clause})`), sql` AND `)
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

function toBrowseResult(row: {
  id: string
  title: string
  description: string | null
  imageUrl: string | null
  tags: string | string[] | null
  source: string | null
  visibility: string
  estimatedMinutes: number | null
}): RecipeSearchResult {
  const tags = parseTagsField(row.tags)
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    tags,
    source: row.source,
    visibility: row.visibility,
    estimatedMinutes: row.estimatedMinutes,
    matchedOn: [],
    snippet: row.description?.slice(0, 120) || row.title,
    score: 0
  }
}

async function countFilteredRecipes(whereClause: SQL): Promise<number> {
  const rows = await db.all(sql`
    SELECT COUNT(*) AS total
    FROM recipes r
    WHERE ${whereClause}
  `) as Array<{ total: number }>
  return Number(rows[0]?.total || 0)
}

async function queryBrowseRecipes(
  whereClause: SQL,
  page: number,
  pageSize: number
): Promise<PaginatedRecipeSearchResults> {
  const total = await countFilteredRecipes(whereClause)
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0
  const safePage = clampSearchPage(page, totalPages)
  const offset = (safePage - 1) * pageSize

  if (total === 0) {
    return { ...emptyPaginatedSearchResults(pageSize), page: safePage }
  }

  const rows = await db.all(sql`
    SELECT
      r.id,
      r.title,
      r.description,
      r.image_url AS imageUrl,
      r.tags,
      r.source,
      r.visibility,
      r.estimated_minutes AS estimatedMinutes
    FROM recipes r
    WHERE ${whereClause}
    ORDER BY r.date DESC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `) as Array<{
    id: string
    title: string
    description: string | null
    imageUrl: string | null
    tags: string | string[] | null
    source: string | null
    visibility: string
    estimatedMinutes: number | null
  }>

  return {
    items: rows.map(toBrowseResult),
    page: safePage,
    pageSize,
    total,
    totalPages
  }
}

async function getFilteredRecipeIds(whereClause: SQL): Promise<string[]> {
  const rows = await db.all(sql`
    SELECT r.id
    FROM recipes r
    WHERE ${whereClause}
  `) as Array<{ id: string }>
  return rows.map((row) => row.id)
}

function applyFavoriteBoost(
  results: RecipeSearchResult[],
  scope: 'all' | 'favorites',
  favoriteRecipeIds?: string[]
) {
  if (scope === 'favorites') {
    const favoriteSet = new Set(favoriteRecipeIds || [])
    return results.filter((result) => favoriteSet.has(result.id))
  }

  if (!favoriteRecipeIds?.length) return results

  const favoriteSet = new Set(favoriteRecipeIds)
  return results.map((result) => ({
    ...result,
    score: favoriteSet.has(result.id) ? result.score + FAVORITE_SEARCH_BOOST : result.score
  }))
}

async function searchWithFtsFiltered(
  query: string,
  allowedIds: string[] | null,
  signedIn: boolean,
  scope: 'all' | 'favorites',
  favoriteRecipeIds?: string[]
): Promise<RecipeSearchResult[]> {
  const ftsQuery = toFtsQuery(query)
  if (!ftsQuery) return []

  if (allowedIds && allowedIds.length === 0) return []

  const visibilityClause = signedIn
    ? sql`1 = 1`
    : sql`r.visibility = 'public'`

  const idFilter = allowedIds?.length
    ? sql`AND recipes_fts.recipe_id IN (${sql.join(allowedIds.map((id) => sql`${id}`), sql`, `)})`
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
      r.estimated_minutes AS estimatedMinutes,
      bm25(recipes_fts) AS rank
    FROM recipes_fts
    JOIN recipes r ON recipes_fts.recipe_id = r.id
    WHERE recipes_fts MATCH ${ftsQuery}
      AND ${visibilityClause}
      ${idFilter}
    ORDER BY rank
    LIMIT 500
  `) as Array<{
    id: string
    title: string
    description: string | null
    imageUrl: string | null
    tags: string | string[] | null
    source: string | null
    visibility: string
    estimatedMinutes: number | null
    rank: number
  }>

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
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
    const tags = parseTagsField(row.tags)
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
      estimatedMinutes: row.estimatedMinutes,
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

  return applyFavoriteBoost(
    results.sort((a, b) => b.score - a.score),
    scope,
    favoriteRecipeIds
  )
}

async function searchWithFallbackFiltered(
  query: string,
  whereClause: SQL,
  scope: 'all' | 'favorites',
  favoriteRecipeIds?: string[]
): Promise<RecipeSearchResult[]> {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []

  const recipes = await db.all(sql`
    SELECT
      r.id,
      r.title,
      r.description,
      r.image_url AS imageUrl,
      r.tags,
      r.source,
      r.visibility,
      r.estimated_minutes AS estimatedMinutes,
      r.steps,
      r.author_id AS authorId
    FROM recipes r
    WHERE ${whereClause}
  `) as Array<{
    id: string
    title: string
    description: string | null
    imageUrl: string | null
    tags: string | string[] | null
    source: string | null
    visibility: string
    estimatedMinutes: number | null
    steps: string | Array<{ title: string; content: string }> | null
    authorId: string | null
  }>

  const ingredientsByRecipe = await loadIngredientNamesByRecipe(recipes.map((recipe) => recipe.id))
  const contributors = await loadContributorNames(
    recipes.map((recipe) => recipe.authorId).filter(Boolean) as string[]
  )

  const results: RecipeSearchResult[] = []

  for (const recipe of recipes) {
    const tags = parseTagsField(recipe.tags)
    const steps = Array.isArray(recipe.steps)
      ? recipe.steps
      : typeof recipe.steps === 'string'
        ? JSON.parse(recipe.steps || '[]')
        : []
    const ingredients = ingredientsByRecipe.get(recipe.id) || []
    const contributor = recipe.authorId ? (contributors.get(recipe.authorId) || '') : ''

    const { score, matchedOn } = scoreFallbackMatch(
      {
        title: recipe.title,
        description: recipe.description,
        tags,
        source: recipe.source,
        steps,
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
      tags,
      source: recipe.source,
      visibility: recipe.visibility,
      estimatedMinutes: recipe.estimatedMinutes,
      matchedOn,
      snippet: buildSnippet(
        {
          title: recipe.title,
          description: recipe.description,
          source: recipe.source,
          ingredients,
          tags
        },
        matchedOn
      ),
      score
    })
  }

  return applyFavoriteBoost(
    results.sort((a, b) => b.score - a.score),
    scope,
    favoriteRecipeIds
  )
}

async function queryTextSearchRecipes(
  query: string,
  whereClause: SQL,
  page: number,
  pageSize: number,
  signedIn: boolean,
  scope: 'all' | 'favorites',
  favoriteRecipeIds?: string[]
): Promise<PaginatedRecipeSearchResults> {
  const allowedIds = await getFilteredRecipeIds(whereClause)

  const ftsAvailable = await isRecipeFtsAvailable()
  let results: RecipeSearchResult[] = []

  if (ftsAvailable) {
    try {
      results = await searchWithFtsFiltered(query, allowedIds, signedIn, scope, favoriteRecipeIds)
    } catch {
      results = []
    }
  }

  if (!ftsAvailable || results.length === 0) {
    results = await searchWithFallbackFiltered(query, whereClause, scope, favoriteRecipeIds)
  }

  const total = results.length
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0
  const safePage = clampSearchPage(page, totalPages)
  const offset = (safePage - 1) * pageSize

  return {
    items: results.slice(offset, offset + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages
  }
}

export async function queryRecipeSearch(options: QueryRecipeSearchOptions): Promise<PaginatedRecipeSearchResults> {
  const filters = options.filters || EMPTY_FILTERS
  const pageSize = Math.min(Math.max(options.pageSize ?? 12, 1), 12)
  const page = Math.max(1, Number(options.page) || 1)
  const scope = options.scope || 'all'
  const query = String(options.query || '').trim()
  const restrictToRecipeIds = getRestrictToRecipeIds(scope, options.favoriteRecipeIds)

  if (restrictToRecipeIds && restrictToRecipeIds.length === 0) {
    return emptyPaginatedSearchResults(pageSize)
  }

  const whereClause = combineWhere(buildBaseWhereClauses(
    options.signedIn,
    restrictToRecipeIds,
    filters
  ))

  if (query.length < 2) {
    return queryBrowseRecipes(whereClause, page, pageSize)
  }

  return queryTextSearchRecipes(
    query,
    whereClause,
    page,
    pageSize,
    options.signedIn,
    scope,
    options.favoriteRecipeIds
  )
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

  const result = await queryRecipeSearch({
    query: trimmed,
    filters: EMPTY_FILTERS,
    page: 1,
    pageSize: limit,
    signedIn: options.signedIn,
    scope,
    favoriteRecipeIds: options.favoriteRecipeIds,
    favoritesFingerprint
  })

  if (result.items.length > 0) {
    await setCachedSearchResults(cacheKey, result.items)
  }

  return result.items
}
