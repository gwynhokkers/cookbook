import { DIET_TAGS, type DietTag, isDietTag } from './dietTags'

export type TimeFilter = 'under-30' | '30-60' | 'over-60'
const TIME_FILTERS = new Set<TimeFilter>(['under-30', '30-60', 'over-60'])

export interface RecipeSearchFilters {
  tags: string[]
  sources: string[]
  diet: DietTag[]
  time: TimeFilter | null
}

function splitCsv(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return []
  return value.split(',').map((s) => s.trim()).filter(Boolean)
}

export function parseRecipeSearchFilters(query: Record<string, unknown>): RecipeSearchFilters {
  const timeRaw = typeof query.time === 'string' ? query.time.trim() : ''
  const time = TIME_FILTERS.has(timeRaw as TimeFilter) ? (timeRaw as TimeFilter) : null

  return {
    tags: splitCsv(query.tags),
    sources: splitCsv(query.sources),
    diet: splitCsv(query.diet).map((d) => d.toLowerCase()).filter(isDietTag),
    time
  }
}

export function hasActiveFilters(filters: RecipeSearchFilters): boolean {
  return filters.tags.length > 0
    || filters.sources.length > 0
    || filters.diet.length > 0
    || filters.time != null
}

export function serializeRecipeSearchFilters(filters: RecipeSearchFilters): Record<string, string> {
  const out: Record<string, string> = {}
  if (filters.tags.length) out.tags = filters.tags.join(',')
  if (filters.sources.length) out.sources = filters.sources.join(',')
  if (filters.diet.length) out.diet = filters.diet.join(',')
  if (filters.time) out.time = filters.time
  return out
}

export function recipeMatchesTagFilter(recipeTags: string[] | null | undefined, filterTags: string[]): boolean {
  if (!filterTags.length) return true
  const normalized = new Set((recipeTags || []).map((t) => t.toLowerCase()))
  return filterTags.some((t) => normalized.has(t.toLowerCase()))
}
