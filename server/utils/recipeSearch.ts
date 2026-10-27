import type { RecipeSearchResult } from '~~/shared/utils/recipeSearchTypes'
import { db } from '../db'
import type { Viewer } from '../domain/recipes/types'
import { getFavoriteRecipeIds } from '../domain/recipes/favorites'
import { searchRecipes } from '../domain/recipes/search'
import { buildFavoritesFingerprint } from './recipeFavorites'
import {
  buildSearchCacheKey,
  getCachedSearchResults,
  getSearchCacheVersion,
  setCachedSearchResults
} from './recipeSearchIndex'

/** First page of text-search results, cached in KV per viewer and favourites. */
export async function searchRecipesCached(
  viewer: Viewer,
  options: { query: string, limit?: number }
): Promise<RecipeSearchResult[]> {
  const trimmed = options.query.trim()
  if (trimmed.length < 2) return []

  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50)
  const favoritesFingerprint = viewer
    ? buildFavoritesFingerprint(viewer.id, await getFavoriteRecipeIds(db, viewer.id))
    : 'none'

  const cacheVersion = await getSearchCacheVersion()
  const cacheKey = buildSearchCacheKey(
    cacheVersion,
    !!viewer,
    'all',
    favoritesFingerprint,
    trimmed,
    limit
  )
  const cached = await getCachedSearchResults<RecipeSearchResult[]>(cacheKey)
  if (cached) return cached

  const result = await searchRecipes(db, viewer, { query: trimmed, page: 1, pageSize: limit })

  if (result.items.length > 0) {
    await setCachedSearchResults(cacheKey, result.items)
  }

  return result.items
}
