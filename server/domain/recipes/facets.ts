import * as schema from '../../db/schema'
import { isDietTag } from '../../../shared/utils/dietTags'
import { visibleTo, type CookbookDb, type Viewer } from './types'

interface TagRow { tags: string[] | null }
interface SourceRow { source: string | null }

export function collectDistinctTags(rows: TagRow[], q: string, limit = 100): string[] {
  const needle = q.trim().toLowerCase()
  const set = new Set<string>()
  for (const row of rows) {
    for (const tag of row.tags || []) {
      const lower = tag.toLowerCase()
      if (isDietTag(lower)) continue
      if (needle && !lower.includes(needle)) continue
      set.add(tag)
      if (set.size >= limit) return [...set].sort((a, b) => a.localeCompare(b))
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function collectDistinctSources(rows: SourceRow[], q: string, limit = 50): string[] {
  const needle = q.trim().toLowerCase()
  const set = new Set<string>()
  for (const row of rows) {
    const source = row.source?.trim()
    if (!source) continue
    if (needle && !source.toLowerCase().includes(needle)) continue
    set.add(source)
    if (set.size >= limit) return [...set].sort((a, b) => a.localeCompare(b))
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

/** Distinct non-diet tags on the recipes the viewer can see, filtered by `q`. */
export async function listTags(db: CookbookDb, viewer: Viewer, q = '') {
  const rows = await db.select({ tags: schema.recipes.tags })
    .from(schema.recipes)
    .where(visibleTo(viewer))
  return collectDistinctTags(rows, q)
}

/** Distinct sources on the recipes the viewer can see, filtered by `q`. */
export async function listSources(db: CookbookDb, viewer: Viewer, q = '') {
  const rows = await db.select({ source: schema.recipes.source })
    .from(schema.recipes)
    .where(visibleTo(viewer))
  return collectDistinctSources(rows, q)
}
