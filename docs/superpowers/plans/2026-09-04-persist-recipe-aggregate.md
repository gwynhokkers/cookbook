# Persist Recipe Aggregate + FTS (c4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make “create/update a recipe with its ingredients and search index” one deep server module so routes and the cookbook import script are thin adapters — cutting Worker/D1 chatter that contributes to Error 1102 during batch imports.

**Architecture:** Introduce a `PersistRecipe` module at `server/utils/persistRecipe.ts` whose interface accepts a **recipe aggregate** (metadata + ingredient rows) and returns a durable recipe. Internally it owns find-or-create ingredients, link rows, FTS document upsert (built from data already in hand when possible), and search-cache invalidation policy. HTTP routes (`import.post`, `index.post`, later put/ingredient routes) and `scripts/recipe-import/upload.mjs` become adapters. Optional import-batch mode defers cache invalidation until end-of-batch.

**Tech Stack:** Nuxt 4 / Nitro, Drizzle ORM, Cloudflare D1 + KV (search cache version), Vitest, existing `recipes_fts` + `syncRecipeSearchIndex` helpers.

**Origin:** Architecture review candidate **c4** (23 Aug 2026) — “Persist recipe aggregate + FTS as one write.”

## What this solves

| Pain today | After PersistRecipe |
|------------|---------------------|
| Cookbook `import.post` does 1 recipe insert + **~3–4 D1 ops per ingredient** (select / insert / select / link) + re-read for FTS + KV cache bump — **per recipe** | One module path; fewer round-trips; FTS doc from aggregate; optional **defer KV invalidate** across a batch |
| Interactive create: `POST /api/recipes` then **N** `POST …/ingredients` (each syncs FTS) via `useRecipeSave` → `linkIngredients` | Single `POST` with ingredients → one FTS sync |
| `syncRecipeSearchIndex` sprinkled across **8** routes — miss one → silent search rot | Locality: persist owns “when to sync”; callers don’t remember |
| Import delays (8–10s) are a band-aid for Worker CPU | Still need pacing for huge books, but each request is cheaper so smaller delays / larger safe batches |

**Explicitly out of scope (do not pull into this plan):**

- c1 extraction staging / `recipeExtractor.ts` split
- c2 full RecipeForm / prefill UX split (only touch `useRecipeSave` as adapter)
- c3 Humphry / Workers AI
- c5 search ranking redesign
- Parallel uploads or removing import audit gates
- D1 `batch()` API unless a measured hotspot remains after aggregate FTS (no batch helper in tree today)

## Global Constraints

- Keep recipe import guardrails: `docs/agents/recipe-import.md` — audit before upload; no `--force` unless user asks; do not chain huge production uploads while verifying.
- Public HTTP contract for existing clients must stay compatible during migration (additive body fields OK).
- Duplicate policy for import remains **skip on title + source** (no silent overwrite).
- FTS must stay consistent for search after create/update; deferred invalidate is allowed only when a batch explicitly finishes with one invalidate.
- Prefer tests at the PersistRecipe seam (in-memory or mocked `db` if feasible; otherwise focused unit tests on pure helpers + integration-style tests against local hub DB).
- Do not commit secrets; run `bun run test` for touched areas.

## File map

| File | Responsibility |
|------|----------------|
| `server/utils/persistRecipe.ts` | **New** deep module: create / replace-ingredients / options for index sync |
| `server/utils/recipeSearchIndex.ts` | Extend: upsert from provided `RecipeSearchDocument`; `invalidateSearchCache` remains; optional `skipCacheInvalidate` |
| `server/api/recipes/import.post.ts` | Thin adapter → `persistRecipe.create` (import mode) |
| `server/api/recipes/index.post.ts` | Thin adapter → create; accept optional `ingredients[]` |
| `app/composables/useRecipeSave.ts` | Create via single POST including ingredients |
| `app/composables/recipeIngredientSync.ts` | Keep for update path until Task 5; create path stops calling `linkIngredients` |
| `tests/server/utils/persistRecipe.test.ts` | Seam tests |
| `docs/agents/recipe-import.md` | Note: prefer smaller Worker load via PersistRecipe; still pace uploads |
| `scripts/recipe-import/README.md` | Optional: mention server-side aggregate; delay still recommended |

---

## Target interface (deep module)

Callers should know only:

```ts
type PersistIngredientInput = {
  ingredientName: string
  amount?: string
  unit?: string
  notes?: string | null
  /** Optional when client already resolved Spoonacular id */
  ingredientId?: string
}

type PersistRecipeCreateInput = {
  title: string
  description?: string | null
  imageUrl?: string | null
  tags?: string[]
  source?: string | null
  servings?: number | null
  estimatedMinutes?: number | null
  steps?: Array<{ title: string; content: string }>
  visibility: 'public' | 'private'
  authorId?: string | null
  date?: Date
  ingredients?: PersistIngredientInput[]
}

type PersistOptions = {
  /** Default true. Import batches may pass false and call invalidate once at end. */
  invalidateSearchCache?: boolean
  /** Import: if title+source exists, return skipped instead of creating */
  skipIfDuplicateSourceTitle?: boolean
}

// create(input, options?) → { recipe, skipped?, linkedCount }
// replaceIngredients(recipeId, ingredients, options?) → void  // later task
```

**Invariants (part of the interface):**

1. After a successful create/update that changes searchable fields, FTS row for that recipe matches the aggregate (unless FTS unavailable).
2. When `invalidateSearchCache: false`, caller **must** invalidate later (document in JSDoc; import adapter owns end-of-batch).
3. Ingredient names are trimmed; empty names dropped; amounts/units default like today’s import (`'1'` / `'pieces'`).

**Deletion test:** If you delete `persistRecipe.ts`, duplicate create/link/FTS logic reappears in import + index.post + client N-link loop — module earns its keep.

---

### Task 1: FTS helpers that accept an in-memory document

**Files:**
- Modify: `server/utils/recipeSearchIndex.ts`
- Create: `tests/server/utils/recipeSearchIndex.document.test.ts` (or extend existing if present)

**Why first:** Today `syncRecipeSearchIndex(recipeId)` always re-queries recipe + ingredients after writes. PersistRecipe should upsert FTS from the aggregate it just wrote.

- [x] **Step 1: Add `upsertRecipeSearchDocument(doc, options?)`**

Export something like:

```ts
export async function upsertRecipeSearchDocument(
  doc: RecipeSearchDocument,
  options?: { invalidateCache?: boolean }
) {
  if (!(await checkFtsAvailable())) return
  await upsertFtsDocument(doc)
  if (options?.invalidateCache !== false) {
    await invalidateSearchCache()
  }
}
```

Also add `buildRecipeSearchDocumentFromAggregate(...)` **or** a small pure helper that maps create input + resolved ingredient names → `RecipeSearchDocument` (no DB). Keep `syncRecipeSearchIndex(recipeId)` as the “reload from DB” path for single-ingredient edits until Task 5.

- [x] **Step 2: Unit-test pure document builder**

Assert title/tags/ingredients/steps/book/author parsing from a fixture aggregate (use `parseRecipeSource` behaviour).

- [ ] **Step 3: Commit** (with Tasks 2–3 in one PR A commit unless splitting)

```bash
git add server/utils/recipeSearchIndex.ts tests/server/utils/recipeSearchIndex.document.test.ts
git commit -m "feat(search): upsert FTS from in-memory recipe document"
```

---

### Task 2: Implement `persistRecipe.create` (core module)

**Files:**
- Create: `server/utils/persistRecipe.ts`
- Create: `tests/server/utils/persistRecipe.test.ts`

**Behaviour (match import.post today, then improve):**

1. Normalize title (`toRecipeTitleCase`), servings, estimatedMinutes, steps, visibility.
2. If `skipIfDuplicateSourceTitle` and both title+source set → return `{ skipped: true, id }`.
3. Insert recipe row.
4. For each ingredient: resolve by `ingredientId` or find-or-create by name; insert `recipe_ingredients`.
5. Build FTS doc from aggregate + linked names; `upsertRecipeSearchDocument`.
6. Return recipe + counts.

**Optimization (same task, keep interface stable):**

- Cache find-or-create within one create call (Map by normalized name) so repeated “salt” in one recipe doesn’t re-select.
- Prefer one select-by-name; if missing, insert once and use that id (avoid today’s double-select after insert if safe).

- [x] **Step 1: Write failing tests for create + duplicate skip + FTS doc fields**

Mock or stub `db` if the codebase already has a pattern; otherwise test pure normalization helpers extracted beside the module and one integration test marked for local hub DB.

Minimum cases:

- create with 2 ingredients → 2 links
- duplicate title+source → skipped
- empty ingredient names ignored
- document builder includes ingredient names without a second DB read (unit)

- [x] **Step 2: Implement `persistRecipe.create` until tests pass**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(recipes): add PersistRecipe create aggregate module"
```

---

### Task 3: Wire `import.post` → PersistRecipe (import Worker win)

**Files:**
- Modify: `server/api/recipes/import.post.ts`
- Modify: `docs/agents/recipe-import.md` (short “server persist” note)
- Optional: `scripts/recipe-import/upload.mjs` — support end-of-batch cache invalidate only if we add a tiny admin endpoint; **v1 can skip client changes** and still win from fewer D1 ops + in-memory FTS

**v1 import adapter:**

```ts
return await persistRecipe.create({ ...body mapped... }, {
  skipIfDuplicateSourceTitle: true,
  invalidateSearchCache: true // keep correct search; deferral is Task 3b
})
```

Delete local `findOrCreateIngredient` from the route.

- [x] **Step 1: Refactor import.post to call persistRecipe; keep response shape** (`skipped`, `id`, `title`, `source`, `ingredientCount`, `stepCount`)

- [x] **Step 2: Manual smoke** — dry-run or local `bun run dev` + one import JSON against localhost (not production)

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor(import): use PersistRecipe aggregate write"
```

#### Task 3b (optional follow-up in same PR or next): deferred cache invalidate for import batches

Only if still hitting 1102 after Task 3:

- Add `POST /api/recipes/import/finalize` (migration-secret) → `invalidateSearchCache()` only
- `upload.mjs`: pass header or body flag `deferSearchCache: true` on each import; call finalize once at end
- PersistRecipe: `invalidateSearchCache: false` when flag set

Do **not** defer FTS row upsert itself (search correctness per recipe); only defer KV version bump.

---

### Task 4: Wire interactive create (kill N+1 link round-trips)

**Files:**
- Modify: `server/api/recipes/index.post.ts` — accept optional `ingredients: PersistIngredientInput[]` (by name and/or id)
- Modify: `app/composables/useRecipeSave.ts` — POST ingredients in body; remove `linkIngredients` on create
- Keep `linkIngredients` for any legacy callers until grep is clean

**Auth:** unchanged (`authorize(createRecipe)` + session `authorId`).

- [ ] **Step 1: Extend index.post body; call `persistRecipe.create` with `authorId`**

- [ ] **Step 2: Update `useRecipeSave.createRecipe` to send ingredients once**

Still run `enrichIngredientsViaParse` client-side before POST (Spoonacular stays outside PersistRecipe for now — pass resolved names/ids).

- [ ] **Step 3: Manual UI create smoke in local dev**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(recipes): create recipe with ingredients in one request"
```

---

### Task 5 (later): Update path + ingredient routes

**Files:**
- `persistRecipe.replaceIngredients` or `updateAggregate`
- `useRecipeSave.updateRecipe` → single PUT with ingredients
- `server/api/recipes/[id].put.ts`
- Eventually: ingredient POST/PUT/DELETE either call thin persist helpers or remain for granular edits but share FTS upsert

**Defer until Tasks 1–4 ship** — update path is more conflict-prone (partial edits, Spoonacular ids). Granular ingredient routes can keep `syncRecipeSearchIndex(recipeId)` short-term.

- [ ] **Step 1: Design replace-ingredients semantics** (full replace vs patch) in a short ADR or plan addendum before coding
- [ ] **Step 2: Implement + migrate `syncRecipeIngredients` client**
- [ ] **Step 3: Commit**

---

### Task 6: Verification & docs

- [ ] **Step 1: Grep for `syncRecipeSearchIndex` — document remaining call sites** (ingredient CRUD, migrate, put)

- [ ] **Step 2: Update `scripts/recipe-import/README.md`** — note cheaper import path; still recommend ≤20 recipes/run and delay; no back-to-back mega uploads

- [ ] **Step 3: Run `bun run test` for new tests; `bun run typecheck` if feasible**

- [ ] **Step 4: Commit docs**

```bash
git commit -m "docs: PersistRecipe aggregate write and import pacing"
```

---

## Suggested implementation order / PR shape

1. **PR A (Tasks 1–3):** FTS from document + PersistRecipe + import adapter — **directly addresses cookbook import Worker load**
2. **PR B (Task 4):** Interactive create single POST
3. **PR C (Task 3b):** Deferred cache invalidate for import batches — only if needed
4. **PR D (Task 5):** Update aggregate — separate design pass

## Success metrics

- Import of an ~15-ingredient recipe: fewer D1 statements than today (log or count in a temporary debug metric if useful).
- Creating a recipe in the UI: **1** recipe POST, **0** follow-up ingredient POSTs.
- Search finds a newly imported recipe without a full FTS rebuild.
- No increase in empty/duplicate import probes; audit gate unchanged.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Breaking import response shape → upload.mjs | Keep field names; add tests / fixture assert |
| Deferred cache → stale search during batch | Only defer KV version; FTS still updated; finalize at end |
| Spoonacular enrich only on client | Task 4 keeps client enrich before POST; server accepts names |
| Over-scoping into RecipeForm split | Touch only `useRecipeSave` |

## Non-goals reminder

This plan does **not** replace upload pacing or batch size limits. PersistRecipe makes each write cheaper; agents must still not chain 46 production imports without pauses.
