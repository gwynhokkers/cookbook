# Recipe Search Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/search` into a filterable, paginated recipe discovery page and add `estimatedMinutes` + diet tags across schema, import, and recipe editing.

**Architecture:** Add nullable `estimated_minutes` column and shared diet/time helpers; extend extraction + import to populate them; add `/api/recipes/tags` and `/api/recipes/sources` helpers; refactor `server/utils/recipeSearch.ts` into `queryRecipeSearch()` (paginated, filter-aware) with a thin `searchRecipes()` wrapper for Humphry/palette; rebuild `app/pages/search.vue` with URL-driven filters and 12-item pagination.

**Tech Stack:** Nuxt 4, Drizzle ORM, SQLite/D1, Vitest, Nuxt UI (`UPagination`, `USelectMenu`, `UDrawer`), existing FTS table `recipes_fts`.

**Spec:** [`docs/superpowers/specs/2026-08-31-recipe-search-filters-design.md`](../specs/2026-08-31-recipe-search-filters-design.md)

## Global Constraints

- Default page size **12**; max **12** on search endpoint.
- Filter logic: **OR** within tags, sources, diet; **AND** between groups.
- Empty `q` + no filters → recent browse sorted by `date` desc.
- Diet tags: canonical lowercase `vegetarian`, `vegan`, `pescatarian`; store **most specific only**.
- `estimatedMinutes` validation: **1–1440** or null.
- Time filter excludes rows where `estimated_minutes IS NULL`.
- Command palette search (`app/composables/useRecipeSearch.ts`) stays text-only — no filter UI in v1.
- Do **not** commit secrets; do **not** use `upload.mjs --force`.
- Run tests with `bun run test`; dev server with `bun run dev`.

## File map

| File | Responsibility |
|------|----------------|
| `shared/utils/dietTags.ts` | Diet tag constants + helpers |
| `shared/utils/formatEstimatedMinutes.ts` | Display `90` → `"1h 30m"` |
| `shared/utils/recipeSearchFilters.ts` | Parse/serialize URL + query filter params |
| `shared/utils/recipeSearchTypes.ts` | Paginated search types |
| `server/utils/recipeSearch.ts` | Filter + browse + FTS + pagination |
| `server/utils/recipeSearchFilters.ts` | SQL filter builders (json_each tags) |
| `server/api/recipes/search.get.ts` | Paginated API handler |
| `server/api/recipes/tags.get.ts` | Distinct tag list |
| `server/api/recipes/sources.get.ts` | Distinct source typeahead |
| `app/components/RecipeSearchFilters.vue` | Filter panel UI |
| `app/pages/search.vue` | Discovery page layout |
| `app/composables/useRecipeSearchQuery.ts` | **New** — shared URL ↔ filter state for search page |

---

### Task 1: Schema migration + shared utilities

**Files:**
- Create: `server/db/migrations/sqlite/0006_add_estimated_minutes.sql`
- Modify: `server/db/schema.ts`
- Create: `shared/utils/dietTags.ts`
- Create: `shared/utils/formatEstimatedMinutes.ts`
- Create: `tests/shared/utils/dietTags.test.ts`
- Create: `tests/shared/utils/formatEstimatedMinutes.test.ts`
- Modify: `shared/utils/recipeListTypes.ts`
- Modify: `shared/utils/recipeSearchTypes.ts`

**Interfaces:**
- Produces:
  - `DIET_TAGS`, `DietTag`, `isDietTag(tag: string): tag is DietTag`
  - `normalizeDietTags(tags: string[]): DietTag[]` — lowercase, dedupe, keep only valid diet tags
  - `applyDietTagSelection(existingTags: string[], selected: DietTag[]): string[]` — sync diet toggles into tag array (remove old diet tags, add selected)
  - `formatEstimatedMinutes(minutes: number | null | undefined): string | null`
  - `RecipeSummary.estimatedMinutes?: number | null`
  - `PaginatedRecipeSearchResults` interface

- [ ] **Step 1: Write failing tests for diet tags**

Create `tests/shared/utils/dietTags.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applyDietTagSelection, isDietTag, normalizeDietTags } from '~~/shared/utils/dietTags'

describe('dietTags', () => {
  it('identifies diet tags', () => {
    expect(isDietTag('vegan')).toBe(true)
    expect(isDietTag('curry')).toBe(false)
  })

  it('normalizes diet tags', () => {
    expect(normalizeDietTags(['Vegan', 'vegan', 'curry'])).toEqual(['vegan'])
  })

  it('replaces diet tags when toggles change', () => {
    expect(applyDietTagSelection(['curry', 'vegetarian'], ['vegan'])).toEqual(['curry', 'vegan'])
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `bun run test tests/shared/utils/dietTags.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `shared/utils/dietTags.ts`**

```ts
export const DIET_TAGS = ['vegetarian', 'vegan', 'pescatarian'] as const
export type DietTag = typeof DIET_TAGS[number]

const DIET_TAG_SET = new Set<string>(DIET_TAGS)

export function isDietTag(tag: string): tag is DietTag {
  return DIET_TAG_SET.has(tag.toLowerCase())
}

export function normalizeDietTags(tags: string[]): DietTag[] {
  const out = new Set<DietTag>()
  for (const tag of tags) {
    const lower = tag.toLowerCase()
    if (isDietTag(lower)) out.add(lower)
  }
  return [...out]
}

export function stripDietTags(tags: string[]): string[] {
  return tags.filter((tag) => !isDietTag(tag))
}

export function applyDietTagSelection(existingTags: string[], selected: DietTag[]): string[] {
  const withoutDiet = stripDietTags(existingTags)
  return [...withoutDiet, ...normalizeDietTags(selected)]
}
```

- [ ] **Step 4: Write failing tests for time formatting**

Create `tests/shared/utils/formatEstimatedMinutes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatEstimatedMinutes } from '~~/shared/utils/formatEstimatedMinutes'

describe('formatEstimatedMinutes', () => {
  it('returns null for empty values', () => {
    expect(formatEstimatedMinutes(null)).toBeNull()
    expect(formatEstimatedMinutes(undefined)).toBeNull()
  })

  it('formats minutes only', () => {
    expect(formatEstimatedMinutes(45)).toBe('45 min')
  })

  it('formats hours and minutes', () => {
    expect(formatEstimatedMinutes(90)).toBe('1h 30m')
    expect(formatEstimatedMinutes(120)).toBe('2h')
  })
})
```

- [ ] **Step 5: Implement `shared/utils/formatEstimatedMinutes.ts`**

```ts
export function formatEstimatedMinutes(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null
  const total = Math.round(minutes)
  const hours = Math.floor(total / 60)
  const mins = total % 60
  if (hours === 0) return `${total} min`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}
```

- [ ] **Step 6: Add migration + schema column**

`server/db/migrations/sqlite/0006_add_estimated_minutes.sql`:

```sql
ALTER TABLE recipes ADD COLUMN estimated_minutes INTEGER;
```

In `server/db/schema.ts`, inside `recipes` table definition after `servings`:

```ts
estimatedMinutes: integer('estimated_minutes'),
```

Update `shared/utils/recipeListTypes.ts` — add to `RecipeSummary`:

```ts
estimatedMinutes?: number | null
```

Update `shared/utils/recipeSearchTypes.ts`:

```ts
export interface RecipeSearchResult {
  // ...existing fields...
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
  return { items: [], page: 1, pageSize, total: 0, totalPages: 0 }
}
```

- [ ] **Step 7: Run tests — expect PASS**

Run: `bun run test tests/shared/utils/dietTags.test.ts tests/shared/utils/formatEstimatedMinutes.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add server/db/migrations/sqlite/0006_add_estimated_minutes.sql server/db/schema.ts shared/utils/dietTags.ts shared/utils/formatEstimatedMinutes.ts shared/utils/recipeListTypes.ts shared/utils/recipeSearchTypes.ts tests/shared/utils/dietTags.test.ts tests/shared/utils/formatEstimatedMinutes.test.ts
git commit -m "feat: add estimatedMinutes schema and diet/time shared utils"
```

---

### Task 2: Recipe CRUD + import pipeline for time and diet

**Files:**
- Modify: `server/api/recipes/import.post.ts`
- Modify: `server/api/recipes/index.post.ts`
- Modify: `server/api/recipes/[id].put.ts`
- Modify: `server/api/recipes/index.get.ts` (include `estimatedMinutes` in summary fields)
- Modify: `server/extraction/types.ts`
- Modify: `server/extraction/normalize.ts`
- Modify: `server/extraction/structure.ts` (prompt text only)
- Modify: `scripts/recipe-import/lib/auditRecipe.mjs`
- Modify: `tests/scripts/recipe-import/audit-recipes.test.ts`
- Modify: `app/components/RecipeForm.vue`

**Interfaces:**
- Consumes: `applyDietTagSelection`, `formatEstimatedMinutes`, `DIET_TAGS` from Task 1
- Produces: recipes persisted with `estimatedMinutes`; extraction JSON includes optional `estimatedMinutes`; audit emits warning codes `missing-estimated-minutes`, `missing-diet-tag`

- [ ] **Step 1: Write failing audit warning tests**

Add to `tests/scripts/recipe-import/audit-recipes.test.ts`:

```ts
it('warns but passes when estimatedMinutes is missing', () => {
  const issues = auditRecipe(base)
  expect(issues.some((i) => i.code === 'missing-estimated-minutes')).toBe(true)
  expect(auditPassed(issues)).toBe(true)
})

it('does not warn when estimatedMinutes is set', () => {
  const issues = auditRecipe({ ...base, estimatedMinutes: 45 })
  expect(issues.some((i) => i.code === 'missing-estimated-minutes')).toBe(false)
})
```

Note: `auditPassed` must ignore warning-severity issues — update `auditRecipe.mjs` accordingly.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `bun run test tests/scripts/recipe-import/audit-recipes.test.ts`
Expected: FAIL

- [ ] **Step 3: Update audit to emit warnings**

In `scripts/recipe-import/lib/auditRecipe.mjs`, after existing required checks:

```js
/** @typedef {'error' | 'warning'} AuditSeverity */

// Add severity to issues: required checks use severity: 'error' (default)
// New warnings:
if (r.estimatedMinutes == null || r.estimatedMinutes === '') {
  issues.push({ code: 'missing-estimated-minutes', severity: 'warning', message: `${prefix}missing estimatedMinutes` })
}

const tags = Array.isArray(r.tags) ? r.tags.map((t) => String(t).toLowerCase()) : []
const hasDiet = tags.some((t) => ['vegetarian', 'vegan', 'pescatarian'].includes(t))
if (!hasDiet) {
  issues.push({ code: 'missing-diet-tag', severity: 'warning', message: `${prefix}no diet tag (ok for meat/fish recipes)` })
}

export function auditPassed(issues) {
  return !issues.some((i) => (i.severity || 'error') === 'error')
}
```

- [ ] **Step 4: Extend extraction schema**

In `server/extraction/types.ts`:

```ts
// ExtractedRecipe interface — add:
estimatedMinutes?: number

// RECIPE_RESPONSE_SCHEMA.properties — add:
estimatedMinutes: { type: 'number' }

// RECIPE_RESPONSE_SCHEMA.required — keep as-is (estimatedMinutes optional)
```

In `server/extraction/normalize.ts` inside `normalizeExtractedRecipe`, pass through:

```ts
estimatedMinutes: typeof raw.estimatedMinutes === 'number'
  ? Math.min(1440, Math.max(1, Math.round(raw.estimatedMinutes)))
  : undefined,
```

In `server/extraction/structure.ts`, extend the system/user prompt string (find existing tags instructions) with:

```
- estimatedMinutes: total time in minutes (prep + cook). Extract from printed times when present; otherwise estimate from steps (include resting/marinating).
- tags: include ONE diet tag when confident (vegan, vegetarian, or pescatarian — most specific only). Omit when uncertain or not applicable.
```

- [ ] **Step 5: Update import + CRUD APIs**

`server/api/recipes/import.post.ts` — extend `ImportBody` and insert:

```ts
estimatedMinutes?: number | null

function normalizeEstimatedMinutes(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(1440, Math.max(1, Math.round(n)))
}

// In insert values:
estimatedMinutes: normalizeEstimatedMinutes(body.estimatedMinutes),
```

Repeat same normalization in `index.post.ts` and `[id].put.ts`.

Add `estimatedMinutes: schema.recipes.estimatedMinutes` to `recipeSummaryFields` in `index.get.ts`.

- [ ] **Step 6: Update RecipeForm**

In `app/components/RecipeForm.vue`:

1. Add to zod schema:

```ts
estimatedMinutes: z.preprocess(
  (val) => (val === '' || val === undefined ? null : val),
  z.union([z.null(), z.coerce.number().int().min(1).max(1440)])
).optional().nullable(),
```

2. Add to `state`:

```ts
estimatedMinutes: props.recipe?.estimatedMinutes ?? null,
```

3. Add diet toggle computed using `applyDietTagSelection`:

```ts
import { DIET_TAGS, applyDietTagSelection, isDietTag, type DietTag } from '~~/shared/utils/dietTags'
import { formatEstimatedMinutes } from '~~/shared/utils/formatEstimatedMinutes'

const selectedDietTags = computed({
  get: () => DIET_TAGS.filter((d) => state.tags.some((t) => t.toLowerCase() === d)),
  set: (next: DietTag[]) => { state.tags = applyDietTagSelection(state.tags, next) }
})

const estimatedMinutesPreview = computed(() => formatEstimatedMinutes(state.estimatedMinutes))
```

4. Template — after tags field, add:

```vue
<UFormField label="Estimated time (minutes)" name="estimatedMinutes">
  <UInput v-model.number="state.estimatedMinutes" type="number" min="1" max="1440" placeholder="e.g. 45" />
  <p v-if="estimatedMinutesPreview" class="mt-1 text-sm text-muted">{{ estimatedMinutesPreview }}</p>
</UFormField>

<UFormField label="Diet">
  <UCheckboxGroup v-model="selectedDietTags" :items="DIET_TAGS.map(d => ({ label: d[0].toUpperCase() + d.slice(1), value: d }))" />
</UFormField>
```

5. Include `estimatedMinutes` in submit payload.

- [ ] **Step 7: Run tests — expect PASS**

Run: `bun run test tests/scripts/recipe-import/audit-recipes.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add server/api/recipes/ server/extraction/ scripts/recipe-import/lib/auditRecipe.mjs tests/scripts/recipe-import/audit-recipes.test.ts app/components/RecipeForm.vue
git commit -m "feat: add estimatedMinutes and diet tags to import, extraction, and recipe form"
```

---

### Task 3: Filter param parsing (shared + server SQL helpers)

**Files:**
- Create: `shared/utils/recipeSearchFilters.ts`
- Create: `server/utils/recipeSearchFilters.ts`
- Create: `tests/shared/utils/recipeSearchFilters.test.ts`
- Create: `tests/server/utils/recipeSearchFilters.test.ts`

**Interfaces:**
- Produces:
  - `export type TimeFilter = 'under-30' | '30-60' | 'over-60'`
  - `export interface RecipeSearchFilters { tags: string[]; sources: string[]; diet: DietTag[]; time: TimeFilter | null }`
  - `parseRecipeSearchFilters(query: Record<string, unknown>): RecipeSearchFilters`
  - `serializeRecipeSearchFilters(filters: RecipeSearchFilters): Record<string, string>`
  - `recipeMatchesTagFilter(recipeTags: string[] | null, filterTags: string[]): boolean` — OR semantics
  - `buildTimeFilterClause(time: TimeFilter | null)` — returns drizzle SQL fragment or null

- [ ] **Step 1: Write failing shared parser tests**

Create `tests/shared/utils/recipeSearchFilters.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseRecipeSearchFilters, serializeRecipeSearchFilters } from '~~/shared/utils/recipeSearchFilters'

describe('parseRecipeSearchFilters', () => {
  it('parses comma-separated params', () => {
    expect(parseRecipeSearchFilters({
      tags: 'curry,thai',
      sources: 'Book A,Book B',
      diet: 'vegan',
      time: 'under-30'
    })).toEqual({
      tags: ['curry', 'thai'],
      sources: ['Book A', 'Book B'],
      diet: ['vegan'],
      time: 'under-30'
    })
  })

  it('ignores invalid diet and time values', () => {
    expect(parseRecipeSearchFilters({ diet: 'keto', time: 'soon' }).diet).toEqual([])
    expect(parseRecipeSearchFilters({ time: 'soon' }).time).toBeNull()
  })
})

describe('serializeRecipeSearchFilters', () => {
  it('round-trips', () => {
    const filters = { tags: ['curry'], sources: [], diet: ['vegan' as const], time: '30-60' as const }
    const query = serializeRecipeSearchFilters(filters)
    expect(parseRecipeSearchFilters(query)).toEqual(filters)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `bun run test tests/shared/utils/recipeSearchFilters.test.ts`

- [ ] **Step 3: Implement `shared/utils/recipeSearchFilters.ts`**

```ts
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
```

- [ ] **Step 4: Implement server SQL helper**

Create `server/utils/recipeSearchFilters.ts`:

```ts
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
```

- [ ] **Step 5: Write server unit test for tag OR matching**

Create `tests/server/utils/recipeSearchFilters.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { recipeMatchesTagFilter } from '~~/shared/utils/recipeSearchFilters'

describe('recipeMatchesTagFilter', () => {
  it('matches any selected tag (OR)', () => {
    expect(recipeMatchesTagFilter(['curry', 'indian'], ['thai', 'curry'])).toBe(true)
    expect(recipeMatchesTagFilter(['indian'], ['thai', 'curry'])).toBe(false)
  })

  it('passes when no filter tags', () => {
    expect(recipeMatchesTagFilter(['curry'], [])).toBe(true)
  })
})
```

- [ ] **Step 6: Run tests — expect PASS**

Run: `bun run test tests/shared/utils/recipeSearchFilters.test.ts tests/server/utils/recipeSearchFilters.test.ts`

- [ ] **Step 7: Commit**

```bash
git add shared/utils/recipeSearchFilters.ts server/utils/recipeSearchFilters.ts tests/shared/utils/recipeSearchFilters.test.ts tests/server/utils/recipeSearchFilters.test.ts
git commit -m "feat: add recipe search filter parsing and SQL helpers"
```

---

### Task 4: Tags and sources API endpoints

**Files:**
- Create: `server/api/recipes/tags.get.ts`
- Create: `server/api/recipes/sources.get.ts`
- Create: `tests/server/utils/recipeFacets.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/recipes/tags?q?` → `{ tags: string[] }` (max 100, excludes `DIET_TAGS`)
  - `GET /api/recipes/sources?q?` → `{ sources: string[] }` (max 50, non-null sources)

- [ ] **Step 1: Write failing facet helper tests**

Create `tests/server/utils/recipeFacets.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { collectDistinctTags, collectDistinctSources } from '~~/server/utils/recipeFacets'

describe('recipeFacets', () => {
  const rows = [
    { tags: ['curry', 'vegan'], source: 'Book A' },
    { tags: ['thai', 'vegetarian'], source: 'Book B' },
    { tags: ['curry'], source: 'Book A' }
  ]

  it('collects distinct non-diet tags', () => {
    expect(collectDistinctTags(rows, '').sort()).toEqual(['curry', 'thai'])
  })

  it('filters tags by prefix', () => {
    expect(collectDistinctTags(rows, 'cu')).toEqual(['curry'])
  })

  it('collects distinct sources with substring filter', () => {
    expect(collectDistinctSources(rows, 'book a')).toEqual(['Book A'])
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement `server/utils/recipeFacets.ts`**

```ts
import { isDietTag } from '~~/shared/utils/dietTags'

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
```

- [ ] **Step 4: Add API routes**

`server/api/recipes/tags.get.ts`:

```ts
import { eq } from 'drizzle-orm'
import { db, schema } from '../../db'
import { viewAllRecipes } from '~~/shared/utils/abilities'
import { collectDistinctTags } from '../../utils/recipeFacets'

export default defineEventHandler(async (event) => {
  const canViewAll = await allows(event, viewAllRecipes)
  const q = String(getQuery(event).q || '')

  let query = db.select({ tags: schema.recipes.tags }).from(schema.recipes)
  if (!canViewAll) {
    query = query.where(eq(schema.recipes.visibility, 'public'))
  }

  const rows = await query
  return { tags: collectDistinctTags(rows, q) }
})
```

`server/api/recipes/sources.get.ts` — same pattern using `source` column and `collectDistinctSources`.

- [ ] **Step 5: Run tests — expect PASS**

Run: `bun run test tests/server/utils/recipeFacets.test.ts`

- [ ] **Step 6: Commit**

```bash
git add server/utils/recipeFacets.ts server/api/recipes/tags.get.ts server/api/recipes/sources.get.ts tests/server/utils/recipeFacets.test.ts
git commit -m "feat: add recipe tags and sources facet API endpoints"
```

---

### Task 5: Paginated filter-aware search backend

**Files:**
- Modify: `server/utils/recipeSearch.ts`
- Modify: `server/api/recipes/search.get.ts`
- Modify: `server/utils/humphryTools.ts`
- Modify: `server/utils/recipeSearchIndex.ts` (`buildSearchCacheKey` — add filter fingerprint)
- Create: `tests/server/utils/recipeSearch.test.ts`

**Interfaces:**
- Consumes: `parseRecipeSearchFilters`, SQL helpers from Tasks 3–4
- Produces:
  - `queryRecipeSearch(options: QueryRecipeSearchOptions): Promise<PaginatedRecipeSearchResults>`
  - `searchRecipes(options: SearchOptions): Promise<RecipeSearchResult[]>` — wrapper: `(await queryRecipeSearch({ ...options, page: 1, pageSize: options.limit ?? 20 })).items`

```ts
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
```

- [ ] **Step 1: Write failing search logic tests (pure helpers first)**

Create `tests/server/utils/recipeSearch.test.ts` with unit tests for a new exported helper:

```ts
import { describe, expect, it } from 'vitest'
import { clampSearchPage } from '~~/server/utils/recipeSearch'

describe('clampSearchPage', () => {
  it('clamps page to valid range', () => {
    expect(clampSearchPage(0, 5)).toBe(1)
    expect(clampSearchPage(99, 3)).toBe(3)
    expect(clampSearchPage(2, 3)).toBe(2)
  })
})
```

Add more tests using mocked recipe rows for `applyClientSideFilters` if you extract in-memory filter for fallback path.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Refactor `server/utils/recipeSearch.ts`**

Key implementation outline:

1. Export `clampSearchPage(page: number, totalPages: number): number`.

2. Add `queryRecipeSearch()` with two paths:

   **Path A — no text query (`q` empty or < 2 chars):**
   ```ts
   // SELECT r.id, r.title, ... r.estimated_minutes, r.date
   // FROM recipes r
   // WHERE visibility + favorite IDs + SQL filter clauses
   // ORDER BY r.date DESC
   // LIMIT pageSize OFFSET offset
   // Separate COUNT(*) query for total
   ```

   **Path B — text query ≥ 2 chars:**
   - Build filtered ID set via SQL (same WHERE clauses without pagination).
   - If empty → return empty paginated.
   - Run existing FTS restricted: `AND recipes_fts.recipe_id IN (...)`.
   - Score + sort by score desc, then paginate in memory OR use LIMIT/OFFSET after sort.
   - For cookbook scale (~500 recipes), sorting scored FTS results then slicing is acceptable.

3. Map rows to `RecipeSearchResult` including `estimatedMinutes`.

4. **Cache:** skip KV cache when `hasActiveFilters(filters)` or `page > 1` or no text query (simplest v1). Keep cache only for legacy text-only page-1 Humphry queries if desired.

5. Change `searchRecipes()`:
   ```ts
   export async function searchRecipes(options: SearchOptions): Promise<RecipeSearchResult[]> {
     const result = await queryRecipeSearch({
       query: options.query,
       filters: { tags: [], sources: [], diet: [], time: null },
       page: 1,
       pageSize: Math.min(Math.max(options.limit ?? 20, 1), 50),
       signedIn: options.signedIn,
       scope: options.scope,
       favoriteRecipeIds: options.favoriteRecipeIds,
       favoritesFingerprint: options.favoritesFingerprint
     })
     return result.items
   }
   ```

6. Update `buildSearchCacheKey` signature to accept optional `filtersKey: string`.

- [ ] **Step 4: Update API handler**

`server/api/recipes/search.get.ts`:

```ts
import { parseRecipeSearchFilters } from '~~/shared/utils/recipeSearchFilters'
import { queryRecipeSearch } from '../../utils/recipeSearch'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = String(query.q || '').trim()
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(Math.max(Number(query.limit) || 12, 1), 12)
  const filters = parseRecipeSearchFilters(query)
  // ... existing auth + favorites setup ...

  return queryRecipeSearch({
    query: q,
    filters,
    page,
    pageSize,
    signedIn: canViewAll,
    scope,
    favoriteRecipeIds,
    favoritesFingerprint
  })
})
```

Remove the early `if (!q) return []` guard — empty query is valid.

- [ ] **Step 5: Verify Humphry still works**

`server/utils/humphryTools.ts` uses `searchRecipes()` — no change required if wrapper returns `items`.

- [ ] **Step 6: Run tests**

Run: `bun run test tests/server/utils/recipeSearch.test.ts`
Manual smoke:
```bash
curl -s 'http://localhost:3000/api/recipes/search?limit=12' | jq '.page, .total, (.items | length)'
curl -s 'http://localhost:3000/api/recipes/search?tags=curry&limit=12' | jq '.total'
```

- [ ] **Step 7: Commit**

```bash
git add server/utils/recipeSearch.ts server/utils/recipeSearchIndex.ts server/api/recipes/search.get.ts tests/server/utils/recipeSearch.test.ts
git commit -m "feat: paginated filter-aware recipe search API"
```

---

### Task 6: Search page UI — filters, chips, pagination

**Files:**
- Create: `app/components/RecipeSearchFilters.vue`
- Create: `app/composables/useRecipeSearchQuery.ts`
- Modify: `app/pages/search.vue`
- Modify: `app/composables/useRecipeSearch.ts`

**Interfaces:**
- Consumes: `PaginatedRecipeSearchResults`, `parseRecipeSearchFilters`, `serializeRecipeSearchFilters`, facet APIs
- Produces: URL-synced filter state; paginated grid on `/search`

- [ ] **Step 1: Create `app/composables/useRecipeSearchQuery.ts`**

```ts
import { parseRecipeSearchFilters, serializeRecipeSearchFilters, type RecipeSearchFilters } from '~~/shared/utils/recipeSearchFilters'
import type { PaginatedRecipeSearchResults } from '~~/shared/utils/recipeSearchTypes'
import { emptyPaginatedSearchResults } from '~~/shared/utils/recipeSearchTypes'

const PAGE_SIZE = 12

export function useRecipeSearchQuery() {
  const route = useRoute()
  const router = useRouter()

  const scope = computed(() => (route.query.scope === 'favorites' ? 'favorites' : 'all'))
  const query = computed(() => String(route.query.q || ''))
  const page = computed(() => Math.max(1, Number(route.query.page) || 1))
  const filters = computed(() => parseRecipeSearchFilters(route.query as Record<string, unknown>))

  function buildQuery(overrides: {
    q?: string
    filters?: RecipeSearchFilters
    page?: number
    scope?: 'all' | 'favorites'
  }) {
    const nextScope = overrides.scope ?? scope.value
    const nextFilters = overrides.filters ?? filters.value
    const nextQ = overrides.q ?? query.value
    const nextPage = overrides.page ?? 1

    const params: Record<string, string> = {
      ...serializeRecipeSearchFilters(nextFilters)
    }
    if (nextScope === 'favorites') params.scope = 'favorites'
    const trimmed = nextQ.trim()
    if (trimmed) params.q = trimmed
    if (nextPage > 1) params.page = String(nextPage)
    return params
  }

  function replaceQuery(overrides: Parameters<typeof buildQuery>[0]) {
    router.replace({ path: '/search', query: buildQuery(overrides) })
  }

  const { data, pending } = useAsyncData(
    () => `recipe-search-${scope.value}-${page.value}-${query.value}-${JSON.stringify(filters.value)}`,
    () => $fetch<PaginatedRecipeSearchResults>('/api/recipes/search', {
      query: {
        ...serializeRecipeSearchFilters(filters.value),
        q: query.value.trim() || undefined,
        page: page.value,
        limit: PAGE_SIZE,
        scope: scope.value
      }
    }),
    { watch: [scope, page, query, filters], default: () => emptyPaginatedSearchResults(PAGE_SIZE) }
  )

  return { scope, query, page, filters, data, pending, replaceQuery, buildQuery, PAGE_SIZE }
}
```

- [ ] **Step 2: Create `app/components/RecipeSearchFilters.vue`**

Props: `filters: RecipeSearchFilters`, emits `update:filters`.

Controls:
- Tags: `USelectMenu` multiple, `:items` from `$fetch('/api/recipes/tags')`, searchable
- Sources: `UInput` debounced → `$fetch('/api/recipes/sources', { query: { q } })`, click to add to selection list
- Diet: `UCheckboxGroup` bound to `filters.diet`
- Time: `URadioGroup` with values `'' | under-30 | 30-60 | over-60`

Desktop: render inline in sidebar (`hidden lg:block w-64 shrink-0`).
Mobile: wrap same component in `UDrawer` opened by "Filters" button.

- [ ] **Step 3: Rewrite `app/pages/search.vue`**

Layout (follow spec ASCII):

```vue
<div class="flex flex-col gap-6 lg:flex-row">
  <RecipeSearchFilters
    class="hidden lg:block w-64 shrink-0"
    :filters="filters"
    @update:filters="(f) => replaceQuery({ filters: f, page: 1 })"
  />
  <div class="flex-1">
    <!-- mobile Filters button + drawer -->
    <!-- scope toggle -->
    <!-- UInput v-model local query, debounced replaceQuery({ q, page: 1 }) -->
    <!-- active filter chips + Clear all -->
    <!-- result count + UPagination (copy index.vue pattern, items-per-page=12) -->
    <!-- UPageGrid of RecipeCard -->
  </div>
</div>
```

Chip row: derive from `filters` + `query`; "Clear all" calls `replaceQuery({ q: '', filters: { tags: [], sources: [], diet: [], time: null }, page: 1 })`.

Empty states:
- Favourites scope with 0 results → "No favourites match your filters."
- Filter browse with 0 → "No recipes match these filters."

Hint when `query.length === 1` → "Type at least 2 characters to search" (still show filter browse results).

- [ ] **Step 4: Update palette composable**

`app/composables/useRecipeSearch.ts` — change fetch type:

```ts
const response = await $fetch<PaginatedRecipeSearchResults>('/api/recipes/search', {
  query: { q: trimmed, scope: 'all', limit: 8, page: 1 }
})
results.value = response.items
```

- [ ] **Step 5: Manual verification**

1. Visit `/search` — 12 recent recipes, no empty state.
2. Select tag filter — URL updates, page resets, results filter.
3. Combine `?q=chicken&diet=vegetarian`.
4. Pagination preserves filters.
5. Command palette search still returns results.

- [ ] **Step 6: Commit**

```bash
git add app/pages/search.vue app/components/RecipeSearchFilters.vue app/composables/useRecipeSearchQuery.ts app/composables/useRecipeSearch.ts
git commit -m "feat: search page with filters, chips, and pagination"
```

---

### Task 7: Card polish + recipe detail time display

**Files:**
- Modify: `app/components/RecipeCard.vue`
- Modify: `app/pages/recipes/[id]/index.vue`
- Modify: `server/api/recipes/[id].get.ts` (if summary omitting field — ensure detail includes `estimatedMinutes`)

**Interfaces:**
- Consumes: `formatEstimatedMinutes`, `formatSearchMatches` from shared utils

- [ ] **Step 1: Add time badge to RecipeCard**

In template footer area (alongside source):

```vue
<span v-if="timeLabel" class="text-xs text-muted">{{ timeLabel }}</span>
```

```ts
import { formatEstimatedMinutes } from '~~/shared/utils/formatEstimatedMinutes'

const timeLabel = computed(() => formatEstimatedMinutes(props.recipe.estimatedMinutes ?? null))
```

Extend `RecipeCard` prop type to accept optional `estimatedMinutes`.

- [ ] **Step 2: Show match hint on search page only**

Pass optional slot or prop to RecipeCard from `search.vue`:

```vue
<p v-if="recipe.matchedOn?.length && query.trim().length >= 2" class="text-xs text-muted">
  Matched: {{ formatSearchMatches(recipe.matchedOn) }}
</p>
```

Or wrap RecipeCard in a div on search page.

- [ ] **Step 3: Show time on recipe detail page**

Near title/metadata in `app/pages/recipes/[id]/index.vue`:

```vue
<p v-if="timeLabel" class="text-sm text-muted">
  <UIcon name="i-lucide-clock" class="size-4 inline" /> {{ timeLabel }}
</p>
```

- [ ] **Step 4: Commit**

```bash
git add app/components/RecipeCard.vue app/pages/recipes/[id]/index.vue app/pages/search.vue server/api/recipes/
git commit -m "feat: show estimated time on cards and recipe detail"
```

---

### Task 8: Docs + spec status

**Files:**
- Modify: `docs/superpowers/specs/2026-08-31-recipe-search-filters-design.md`
- Modify: `docs/agents/recipe-import.md`

- [ ] **Step 1: Update spec status**

Change header `Status: Draft (brainstorming)` → `Status: Approved`.

- [ ] **Step 2: Add import agent notes**

In `docs/agents/recipe-import.md`, under "What review means" bullet list, add:

```markdown
- `estimatedMinutes` set (extract from OCR or reasonable estimate).
- Diet tag (`vegan`, `vegetarian`, or `pescatarian`) when applicable — most specific only.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-08-31-recipe-search-filters-design.md docs/agents/recipe-import.md docs/superpowers/plans/2026-08-31-recipe-search-filters.md
git commit -m "docs: approve recipe search filters spec and implementation plan"
```

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| Default recent browse, 12/page | Task 5, 6 |
| Filter without text | Task 5, 6 |
| Tag/source/diet/time filters | Task 3, 4, 5, 6 |
| OR/AND filter logic | Task 3, 5 |
| URL params | Task 3, 6 |
| `estimatedMinutes` schema | Task 1 |
| Import/extraction/audit | Task 2 |
| Recipe form diet toggles | Task 2 |
| Paginated API response | Task 5 |
| Tags/sources endpoints | Task 4 |
| Mobile filter drawer | Task 6 |
| Time badge + match hints | Task 7 |
| Humphry/palette compat | Task 5, 6 |
| Tests | All tasks |

No placeholders remain. Types consistent: `PaginatedRecipeSearchResults`, `RecipeSearchFilters`, `queryRecipeSearch`.

---

## Manual test checklist (final QA)

- [ ] `/search` loads 12 recent recipes with no params
- [ ] Tag filter only → filtered browse, no text required
- [ ] Source typeahead → select → filters results
- [ ] Diet + time filters combine correctly
- [ ] Text + filters AND together
- [ ] Pagination preserves filters in URL
- [ ] Favourites scope respects filters
- [ ] Logged-out users see public recipes only on facet endpoints
- [ ] Create/edit recipe with minutes + diet toggles persists
- [ ] Import JSON with `estimatedMinutes` uploads correctly
- [ ] Audit warns on missing time but still passes
- [ ] Command palette search still works
