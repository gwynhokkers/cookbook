# Recipe import — agent guardrails

Mandatory reading before any cookbook OCR → JSON → production upload work.

Pipeline docs and commands: [`scripts/recipe-import/README.md`](../../scripts/recipe-import/README.md).

## Required workflow (do not skip steps)

```text
OCR → structure (optional draft) → human/agent review per recipe → audit → upload
```

| Step | Tool | Agent rule |
|------|------|------------|
| 1. OCR | `import:ocr` / `ocr.mjs` | Batch ~10–15 pages |
| 2. Structure | `import:structure` / `structure_recipes.mjs` | **Draft only** — not upload-ready |
| 3. Review | Edit JSON in place | **One recipe at a time** against OCR markdown |
| 4. Audit | `import:audit` / `audit-recipes.mjs` | Must pass with **0 issues**; writes `review-pass.json` |
| 5. Upload | `import:upload` / `upload.mjs` | Blocked without fresh `review-pass.json`; 8s delay between POSTs |

## Hard limits

- **Max ~20 recipes per review cycle.** Split larger chapters into multiple runs (`recipes-run1`, `recipes-run2`, …).
- **Max ~15 pages per OCR batch** unless the user explicitly asks for more.
- **Never upload in the same turn as JSON generation.** Review and audit must happen in a prior step (or explicit user sign-off after spot-check).
- **Never use `--force` on upload** unless the user explicitly requests bypassing audit (emergency only).

## Forbidden patterns (caused Curry run5 failure)

These are **not** acceptable substitutes for per-recipe review:

1. **Bulk JSON generation** — scripts like `generate-run5.mjs`, `_generate.mjs`, or nested Task prompts (“write ALL 43 JSON files”).
2. **Uploading raw `structure_recipes.mjs` output** without editing every file against OCR.
3. **Parser-only fixes** — override tables that patch some recipes but ship the rest untouched.
4. **Empty-body import probes** — `POST /api/recipes/import` with `{}` or minimal body creates empty duplicate recipes.
5. **Parallel / rapid-fire upload** — no delays, looping curl, or uploading while another batch runs.
6. **Delegating review to a subagent without verifying output** — parent agent must spot-check files before audit.

## What “review” means

For **each** recipe JSON file, compare to the source page markdown and confirm:

- Title and description match the book (fix OCR typos).
- Every ingredient has a sensible `ingredientName`, `amount`, `unit`, `notes` — no jammed columns.
- Method steps are complete sentences in cooking order — no table separators, flavor tags, or stray quantities as steps.
- Sub-recipes on the same page are merged or split intentionally (document in `carry-forwards.json` if deferred).
- `source`, `visibility: private`, and tags are correct.
- `estimatedMinutes` set (extract from OCR or reasonable estimate).
- Diet tag (`vegan`, `vegetarian`, or `pescatarian`) when applicable — most specific only.

## Audit gate (enforced)

`upload.mjs` refuses to run unless:

1. `review-pass.json` exists in the recipe directory.
2. File SHA-256 hashes match the audited files (any edit after audit → re-audit).
3. Inline audit heuristics still pass (catches dashed steps, jammed ingredients, etc.).

```bash
node scripts/recipe-import/audit-recipes.mjs --book curry --run 5
node scripts/recipe-import/upload.mjs --book curry --run 5
```

## Upload safety

- One recipe per request; default **8 second** delay (`--delay-ms` to adjust).
- Stops on **503 / 502 / 1102** — do not retry in a tight loop; wait and resume with `--limit`.
- Import API **skips** duplicates on `title + source` — it does **not** update bad recipes. Delete via D1/wrangler before reimporting fixes.
- Server path: `import.post` uses `createPersistRecipe` (recipe + ingredients + FTS in one module). That cuts D1 chatter vs the old per-ingredient re-select / post-write FTS rebuild, but **does not** replace pacing — still max ~20 recipes per run and wait between runs if production feels hot.

## End-of-batch summary (required)

Report to the user:

- Pages OCR'd / empty failures
- Recipes reviewed (count + run directory)
- Audit result (pass/fail + issue list if fail)
- Upload result (created / skipped / failed + IDs)
- Corrections made during review
- Carry-forwards skipped

## When things go wrong

- **Bad recipes already on production:** delete by title+source in D1, fix JSON, re-audit, re-upload one at a time.
- **Audit flags false positives:** fix the heuristic in `lib/auditRecipe.mjs` with a test — do not `--force` upload.
