# Shopping List: Manual Items & Recipe Selection UX

**Date:** 2026-08-27  
**Status:** Approved (brainstorming)  
**Scope:** Manual shopping-list items, recipe selection UX rework, generate/recipe-change behavior

## Problem

1. Users cannot add ad-hoc items (e.g. "chicken", "chocolate", "toilet rolls") that are not tied to a stored recipe.
2. The "Recipes for this day" section shows the entire recipe catalog with checkboxes, which is noisy. Selected recipes are duplicated again as badges below.
3. Changing recipes or regenerating currently deletes **all** shopping list items, which would wipe any manual additions.

## Goals

- Add name-only manual items immediately (no Generate required).
- Show only selected recipes, with inline search to add more.
- Preserve manual items across recipe changes and Generate.
- Warn when Generate would produce recipe items that overlap manual names (case-insensitive).

## Non-goals (v1)

- Quantity/unit/aisle editing for manual items.
- Merge manual + recipe overlap into a single row.
- Favorites shortcut for recipe add.
- Bulk paste of items.

## Decisions (from brainstorming)

| Question | Choice |
|----------|--------|
| Manual items on re-Generate | Keep manuals; warn on name overlap |
| Manual add form | Name only (type + Enter) |
| Recipe add UX | Inline search on page |
| Recipe change behavior | Keep all items until next Generate; mark list stale |

## Approach

**Explicit item source (recommended over inference or separate tables).**

Add `source: 'recipe' | 'manual'` on `shopping_list_items`. Generate replaces only recipe-sourced rows. Manual rows survive recipe edits and regeneration.

## Page UX

### Recipes for this day

1. **Selected list only** — compact rows (title + remove). Empty state: "No recipes yet — search below to add."
2. **Inline search** below — type to filter cookbook; pick a result to add. Already-selected recipes hidden or marked "Added". Remove the full-catalog checkbox list and duplicate badge strip.
3. Header actions unchanged: Generate with Humphry, Copy, Print.

### Ingredients

1. Existing checklist (recipe + manual mixed).
2. **Add item** row: single text field + Enter/Add. Name only; appears immediately without Generate.
3. Manual rows removable and checkable. Subtle "Manual" label for distinction after Generate.
4. **Stale cue:** When recipes changed since last generate (`status: 'draft'` with prior `generatedAt`), show banner: "Recipes changed — Generate again to refresh ingredients." Manual items remain visible.

## Data model

### Schema change

`shopping_list_items.source` — text, `'recipe' | 'manual'`, default `'recipe'`.

Existing rows backfill to `'recipe'`.

Manual item defaults on create:

- `source: 'manual'`
- `name`: user input (trimmed, required)
- `totalAmount`, `totalUnit`, `displayAmount`: empty strings
- `contributions`: `[]`
- `ingredientId`: null
- `aisle`: null (group under "Other" in copy/print when uncategorized)

### DTO

Expose `source` on each item in `ShoppingListItemDto`.

Optional on list DTO: `overlaps?: string[]` after generate (names that collided with manuals).

## API

### Recipe membership (existing routes, behavior change)

`PUT/POST/DELETE …/shopping-lists/:id/recipes` — update `shopping_list_recipes` only. **Do not delete shopping list items.** Set `status: 'draft'`. Keep `generatedAt` for stale detection.

### New routes

| Method | Path | Body | Behavior |
|--------|------|------|----------|
| POST | `/api/shopping-lists/:id/items` | `{ name: string }` | Create manual item |
| DELETE | `/api/shopping-lists/:id/items/:itemId` | — | Remove any item (manual or recipe) |

Existing `PATCH …/items/:itemId` for `checked` unchanged.

### Generate (behavior change)

1. Amalgamate ingredients from selected recipes (unchanged).
2. Delete items where `source = 'recipe'` for this list.
3. Insert new recipe-sourced items (Humphry enrichment as today).
4. Preserve all `source = 'manual'` items and their checked state.
5. Detect overlaps: normalize names (trim + lowercase). If a new recipe item name matches a manual name, include in response `overlaps` array.
6. Set `status: 'generated'`, update `generatedAt`.

### Overlap handling (v1)

**Default:** Keep both rows (manual + recipe). Show warning toast/alert listing names, e.g. "Also on your list as manual: chicken."

**User actions from alert or inline on manual row:**

- **Keep both** (default)
- **Remove manual** (delete manual row; keep generated recipe row)

No merge action in v1.

### Copy / print

Include manual items in output. Items without aisle go in an "Other" group.

## Composable changes

`useShoppingList` additions:

- `addManualItem(name: string)`
- `removeItem(itemId: string)`

Recipe search on page can use existing `/api/recipes` with client-side filter, or search endpoint if already available — prefer reusing existing recipe list/search patterns in the codebase.

## Component changes

- **`shopping-list.vue`:** Replace checkbox catalog with selected list + inline search; add manual item input; stale banner.
- **`ShoppingList.vue` (ingredients):** Show manual label; delete control per row; wire add/remove/toggle.

## Errors

| Case | Response |
|------|----------|
| Empty/whitespace name on add | 400; keep field focused |
| Duplicate manual name | Allowed (no block) |
| Unauthenticated / wrong owner | Existing shopping-list auth |
| Generate with zero recipes | Keep current disabled/error behavior; manuals alone do not require Generate |

## Tests

API/unit tests (align with existing shopping-list test style):

1. Add manual item → `source: 'manual'`, appears in list DTO.
2. Change recipes → items unchanged including manuals; status draft.
3. Generate → recipe items replaced; manuals preserved; `overlaps` when names collide.
4. Delete item → removed; checked toggle works for both sources.
5. Recipe routes no longer wipe items on PUT/POST/DELETE.

## Migration

1. Add `source` column with default `'recipe'`.
2. Run `npx nuxt db generate` for migration file.

## Implementation order (high level)

1. Schema + migration + DTO types.
2. Server: stop deleting all items on recipe change; selective delete on generate; POST/DELETE item routes.
3. Composable methods.
4. Page UX: recipe section rework + manual add + stale banner + overlap toast.
5. Tests.
