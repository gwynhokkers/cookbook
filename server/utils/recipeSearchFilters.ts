import { sql, type SQL } from 'drizzle-orm'
import type { RecipeSearchFilters } from '~~/shared/utils/recipeSearchFilters'

export function buildTimeFilterSql(time: RecipeSearchFilters['time']): SQL | null {
  if (!time) return null
  if (time === 'under-30') return sql`r.estimated_minutes IS NOT NULL AND r.estimated_minutes < 30`
  if (time === '30-60') return sql`r.estimated_minutes IS NOT NULL AND r.estimated_minutes >= 30 AND r.estimated_minutes <= 60`
  return sql`r.estimated_minutes IS NOT NULL AND r.estimated_minutes > 60`
}

/** OR-match any tag/diet value against recipes.tags JSON array (case-insensitive). */
export function buildJsonTagsOrMatchSql(columnSql: SQL, values: string[]): SQL | null {
  if (!values.length) return null
  const lowered = values.map((v) => v.toLowerCase())
  return sql`EXISTS (
    SELECT 1 FROM json_each(${columnSql}) je
    WHERE lower(je.value) IN (${sql.join(lowered.map((v) => sql`${v}`), sql`, `)})
  )`
}

export function buildSourcesOrMatchSql(values: string[]): SQL | null {
  if (!values.length) return null
  return sql`r.source IN (${sql.join(values.map((v) => sql`${v}`), sql`, `)})`
}
