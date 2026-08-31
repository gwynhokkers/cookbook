# Recipe Search: Filters, Pagination & Estimated Time

**Date:** 2026-08-31  
**Status:** Approved  
**Scope:** Enhanced `/search` discovery page, filter API, `estimatedMinutes` field, diet tag conventions, import pipeline updates

## Problem

1. Search requires a text query (min 2 chars) and returns up to 50 unpaginated results — no way to browse or filter systematically.
2. Tags and sources are searchable via text but not selectable as filters.
3. No diet classification (vegetarian / vegan / pescatarian) on recipes.
4. No estimated cooking time on recipes or in the import pipeline.

## Goals

- `/search` works as a **discovery page**: default shows recent recipes; filters work without text.
- Multi-select filters for **tags** and **sources**; dedicated **diet** and **time** controls.
- Paginated results: **12 per page**, URL-driven state.
- Add **`estimatedMinutes`** to recipes; extract or AI-estimate during import.
- Canonical **diet tags** on recipes; infer during import when not in OCR.

## Non-goals (v1)

- Filters in global command-palette search (`app.vue`).
- Prep vs cook time split (single total only).
- Ingredient exclude / include filters.
- Difficulty rating.
- Facet counts endpoint (tag/source counts for current filter set).
- Automatic backfill of diet/time for all existing recipes (manual edit + future imports only).
- Full-text search index changes for `estimatedMinutes`.

## Decisions (from brainstorming)

| Question | Choice |
|----------|--------|
| Empty search + no filters | Show **12 most recent** recipes (by `date` desc) |
| Filters without text query | **Allowed** — filter-only browse |
| Multiple tags selected | **OR** within tags (match any) |
| Multiple sources selected | **OR** within sources (match any) |
| Between filter groups | **AND** (must satisfy text + tags + sources + diet + time) |
| Diet representation | Canonical lowercase tags: `vegetarian`, `vegan`, `pescatarian` |
| Time storage | Single nullable integer column `estimated_minutes` |
| API approach | Extend `/api/recipes/search` (not separate browse endpoint) |

## Page UX

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Search recipes                    [All] [Favourites] │
├──────────────────┬──────────────────────────────────────┤
│  Filters         │  [Search box....................]    │
│                  │  [chip: curry ×] [chip: vegan ×] Clear │
│  Tags ▼          │  142 results · Page 2 of 12            │
│  Sources ▼       │  ┌────┐ ┌────┐ ┌────┐ ┌────┐           │
│  Diet            │  │card│ │card│ │card│ │card│  (grid)  │
│  Time            │  └────┘ └────┘ └────┘ └────┘           │
│                  │  [← Prev]  1 2 3 … 12  [Next →]       │
└──────────────────┴──────────────────────────────────────┘
```

On mobile, filters collapse into a sheet/drawer triggered by a “Filters” button.

### Default load

- URL: `/search` (no query params).
- Shows 12 most recent visible recipes, sorted by `date` desc.
- No empty state prompt.

### Modes (combinable)

| Mode | Trigger | Sort |
|------|---------|------|
| Recent browse | No `q`, no filters | `date` desc |
| Filter browse | Filters set, no `q` | `date` desc |
| Text search | `q` ≥ 2 chars | Relevance score desc |
| Combined | `q` + filters | Relevance score desc |

When `q` is 1 character, show hint “Type at least 2 characters to search” but still allow filter-only browse if filters are active.

### Filter controls

1. **Tags** — searchable multi-select populated from `GET /api/recipes/tags` (distinct non-diet tags). Diet tags excluded from this list.
2. **Sources** — combobox: type to search distinct sources via `GET /api/recipes/sources?q=…`, select one or more. Selected sources shown as chips.
3. **Diet** — checkbox/toggle group: Vegetarian, Vegan, Pescatarian. OR within selected diets.
4. **Time** — radio or toggle group: Any / Under 30 min / 30–60 min / Over 60 min. Maps to `estimatedMinutes` ranges.

### Active filters

- Removable chips below search box.
- “Clear all” resets filters and `q`, returns to recent browse.
- Changing any filter resets `page` to 1.

### Result cards

- Reuse `RecipeCard`; extend summary type with optional `estimatedMinutes`.
- When `matchedOn` is present (text search), show subtle hint: “Matched: ingredient, tag”.
- Show estimated time badge when set (e.g. “45 min”).

### Scope toggle

- **All recipes** / **Favourites** unchanged.
- Favourites scope restricts candidate set to user's saved recipe IDs before filters/pagination.

## URL parameters

| Param | Type | Example |
|-------|------|---------|
| `q` | string | `chicken` |
| `tags` | comma-separated | `curry,thai` |
| `sources` | comma-separated (URL-encoded) | `Curry+Easy+%E2%80%94+Atul+Kochhar` |
| `diet` | comma-separated | `vegetarian,vegan` |
| `time` | enum | `under-30`, `30-60`, `over-60` |
| `page` | integer | `2` |
| `scope` | `all` \| `favorites` | `favorites` |

## Data model

### Schema change

Add to `recipes` table (SQLite migration `0006_add_estimated_minutes.sql`):

```sql
ALTER TABLE recipes ADD COLUMN estimated_minutes INTEGER;
```

Drizzle: `estimatedMinutes: integer('estimated_minutes')` — nullable.

### Diet tags

Canonical values stored in existing `tags` JSON array:

- `vegetarian`
- `vegan`
- `pescatarian`

Shared constant: `shared/utils/dietTags.ts`

```ts
export const DIET_TAGS = ['vegetarian', 'vegan', 'pescatarian'] as const
export type DietTag = typeof DIET_TAGS[number]
export function isDietTag(tag: string): tag is DietTag
export function normalizeDietTags(tags: string[]): string[]  // dedupe, lowercase
```

**Inference rules (import AI prompt):**

- **Vegan:** no meat, fish, dairy, eggs, honey.
- **Vegetarian:** no meat or fish; dairy/eggs allowed.
- **Pescatarian:** fish/seafood allowed; no meat/poultry.
- A recipe may have multiple diet tags only when accurate (e.g. vegan implies vegetarian — store **most specific only**: vegan alone, not vegan+vegetarian).
- When uncertain, omit diet tag (do not guess wildly).

### Time field

- **Storage:** integer minutes (e.g. 90 = 1h 30m).
- **Display:** `formatEstimatedMinutes(90)` → `"1h 30m"`; `45` → `"45 min"`.
- **Validation:** 1–1440 (24h max); null allowed.
- **Import JSON:** optional `estimatedMinutes` number.

## API

### `GET /api/recipes/search` (extended)

**Query params:** `q`, `tags`, `sources`, `diet`, `time`, `page`, `limit` (default 12, max 12 for this endpoint), `scope`

**Response:** `PaginatedRecipeSearchResults`

```ts
interface PaginatedRecipeSearchResults {
  items: RecipeSearchResult[]  // includes estimatedMinutes
  page: number
  pageSize: number
  total: number
  totalPages: number
}
```

**Query logic:**

1. Build base candidate set (visibility + favourites scope).
2. Apply SQL filters (AND between groups):
   - **Tags (OR):** recipe tags JSON contains any selected tag. Use `json_each` or fetch + filter pattern consistent with SQLite/D1.
   - **Sources (OR):** `source IN (...)`.
   - **Diet (OR):** tags contain any selected diet tag.
   - **Time:** `estimated_minutes` within range; recipes with `NULL` excluded when time filter active.
3. If `q` ≥ 2 chars: FTS match + score within filtered set; else sort by `date` desc.
4. Count total, apply offset/limit for page.
5. Update cache key to include all filter params (or disable cache for filtered browse initially — simpler v1).

**Breaking change:** Response shape changes from array to paginated object. Update:
- `app/pages/search.vue`
- `app/composables/useRecipeSearch.ts` (palette stays array — fetch with `limit=8`, ignore pagination wrapper or add `?format=legacy` — prefer updating palette to use `.items`).

### `GET /api/recipes/tags` (new)

Returns distinct tags across visible recipes, excluding `DIET_TAGS`. Optional `q` prefix search. Limit 100.

### `GET /api/recipes/sources` (new)

Returns distinct `source` values. Optional `q` substring search (case-insensitive). Limit 50.

Both endpoints respect visibility (public-only when logged out).

## Import pipeline

### JSON schema (reviewed recipe files)

Add optional field:

```json
{
  "estimatedMinutes": 45,
  "tags": ["curry", "indian", "vegan"]
}
```

### Extraction (`server/extraction/types.ts`)

- Add `estimatedMinutes?: number` to `ExtractedRecipe` and `RECIPE_RESPONSE_SCHEMA`.
- Prompt additions:
  - Extract total time from OCR if printed (sum prep + cook).
  - If absent, estimate from step count and techniques (marinating/resting times in step text).
  - Assign diet tag using inference rules above.

### Structure script (`structure_recipes.mjs`)

- Pass through `estimatedMinutes` from AI output.
- No change to `--tags` CLI (book-level cuisine tags); diet tags come from per-recipe AI.

### Audit (`audit-recipes.mjs` / `lib/auditRecipe.mjs`)

**Warnings only (do not fail audit):**

- `missing-estimated-minutes` — no `estimatedMinutes`.
- `missing-diet-tag` — no diet tag (informational; many meat recipes won't have one).

### Upload / import API

- Accept `estimatedMinutes` in `ImportBody`.
- Persist to `estimated_minutes` column.

### Recipe form

- Optional number input “Estimated time (minutes)” with formatted preview.
- Diet tags: either auto-managed via dedicated diet toggles in form (sync to `tags` array) or manual tag entry — **prefer dedicated diet toggles** below tag field to keep UX clear.

## Component changes

| File | Change |
|------|--------|
| `app/pages/search.vue` | Filter panel, chips, pagination, paginated fetch |
| `app/components/RecipeSearchFilters.vue` | **New** — tags, sources, diet, time controls |
| `app/components/RecipeCard.vue` | Optional time badge |
| `app/components/RecipeForm.vue` | `estimatedMinutes` field + diet toggles |
| `app/composables/useRecipeSearch.ts` | Use `.items` from paginated response |
| `shared/utils/recipeSearchTypes.ts` | Paginated type, `estimatedMinutes` on result |
| `shared/utils/formatEstimatedMinutes.ts` | **New** display helper |
| `shared/utils/dietTags.ts` | **New** constants |
| `server/utils/recipeSearch.ts` | Filter + pagination logic |
| `server/api/recipes/search.get.ts` | New params, paginated response |
| `server/api/recipes/tags.get.ts` | **New** |
| `server/api/recipes/sources.get.ts` | **New** |
| `server/db/schema.ts` | `estimatedMinutes` column |

## Errors & edge cases

- Invalid `page` → clamp to 1 or last page.
- Unknown diet/time enum → ignore invalid value (400 optional).
- Empty filter selections → treat as “any” (no filter applied).
- Favourites + empty favourites → empty paginated result with message.
- Time filter with mostly null data → few results until imports backfill; acceptable for v1.

## Tests

- `recipeSearch.ts`: filter combinations (OR tags, AND groups), pagination, recent browse, text + filters.
- `dietTags.ts`: normalization, `isDietTag`.
- `formatEstimatedMinutes.ts`: display cases.
- API integration: search returns paginated shape; tags/sources endpoints respect visibility.
- Audit: warnings for missing time/diet do not fail pass.

## Implementation order

1. **Schema + shared utils** — migration, `dietTags`, `formatEstimatedMinutes`, types.
2. **Import / extraction** — schema, prompts, audit warnings, import API, recipe form.
3. **Auxiliary APIs** — `/api/recipes/tags`, `/api/recipes/sources`.
4. **Search backend** — filter logic, pagination, paginated response.
5. **Search UI** — filters, chips, pagination, default recent browse.
6. **Polish** — time badge on cards, match hints, mobile filter drawer.

## Migration / existing data

- Existing recipes: `estimated_minutes` null; no diet tags until edited or re-imported.
- No blocking backfill script in v1.
- Document in import agent guide: add diet + time during per-recipe review.
