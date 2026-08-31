export type SearchMatchField =
  | 'title'
  | 'ingredient'
  | 'tag'
  | 'source'
  | 'step'
  | 'description'
  | 'contributor'

export interface RecipeSearchResult {
  id: string
  title: string
  description: string | null
  imageUrl: string | null
  tags: string[]
  source: string | null
  visibility: string
  matchedOn: SearchMatchField[]
  snippet?: string
  score: number
  estimatedMinutes?: number | null
}

export interface PaginatedRecipeSearchResults {
  items: RecipeSearchResult[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export function emptyPaginatedSearchResults(pageSize = 12): PaginatedRecipeSearchResults {
  return {
    items: [],
    page: 1,
    pageSize,
    total: 0,
    totalPages: 0
  }
}

export const SEARCH_MATCH_LABELS: Record<SearchMatchField, string> = {
  title: 'title',
  ingredient: 'ingredient',
  tag: 'tag',
  source: 'book/source',
  step: 'step',
  description: 'description',
  contributor: 'contributor'
}

export function formatSearchMatches(matchedOn: SearchMatchField[]) {
  return matchedOn.map((field) => SEARCH_MATCH_LABELS[field]).join(', ')
}
