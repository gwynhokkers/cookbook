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
