# Recipe import (local Docling)

Offline pipeline for any cookbook scans: OCR with Docling → structure into JSON → review → POST to `/api/recipes/import`. No recipe images are uploaded.

The Nuxt API (`server/api/recipes/import.post.ts`) is generic. This folder is only the local OCR/batch client.

Docling flags (Apple Vision via `--ocr-engine ocrmac`):

```bash
docling convert --from image --to md --ocr --ocr-engine ocrmac --image-export-mode placeholder --output DIR SOURCE
```

## Agent prompt (reuse for each batch)

Copy/paste into Cursor. Fill in the scan path, book slug, and book source attribution:

```text
Run the next cookbook import batch using scripts/recipe-import.

I am providing:
- Scan folder: <ABSOLUTE_PATH_TO_PAGE_IMAGES>
- Book slug: <short-slug>   (e.g. baan, hot-sour-salty-sweet)
- Book source string: "<Book Title — Author>"
- Tags (optional): <comma,separated,tags>
- Batch size: ~10–15 pages (or say "continue from <last IMG filename>")

Tools:
- OCR: node scripts/recipe-import/ocr.mjs --source "<scans>" --book <slug> --limit N
- Structure: node scripts/recipe-import/structure_recipes.mjs --book <slug> --book-source "<Book Title — Author>" --tags <tags>
- Upload: node scripts/recipe-import/upload.mjs --book <slug> --base-url https://cookbook.megwyn.co.uk
- Auth: load MIGRATION_SECRET from .env (never print it). Use `set -a; source .env; set +a` then run upload.mjs so the shell does not mangle special characters.

Rules:
- visibility: private
- source: exactly the book source string above
- no recipe images
- BEFORE uploading: review every draft against the OCR markdown. Fix titles, descriptions, ingredients (amount/unit/name/notes), and steps. Merge duplicate page scans of the same recipe. Drop empty shells, chapter headers, and incomplete/scrambled fragments. Rewrite JSON in place as needed.
- Do not auto-upload raw structure output without review.
- Do not commit secrets or out/ artefacts.
- Max ~20 recipes per review cycle; max ~15 pages per OCR batch.
- Never bulk-generate JSON (no "write all N recipes" scripts or subagents). Review one recipe at a time.
- Never upload in the same step as JSON creation — audit must pass first.
- Never POST empty/minimal bodies to /api/recipes/import (creates empty duplicates).

Agent guardrails (mandatory): docs/agents/recipe-import.md

End with a summary:
- pages OCR’d / failed empty
- recipes uploaded (title + id)
- recipes skipped and why
- corrections made during review
- any auth or API errors
```

## Commands

```bash
# 1. OCR (writes scripts/recipe-import/out/<slug>/pages)
node scripts/recipe-import/ocr.mjs \
  --source "/path/to/scans" \
  --book my-book \
  --limit 12

# 2. Structure drafts (requires book attribution)
node scripts/recipe-import/structure_recipes.mjs \
  --book my-book \
  --book-source "Book Title — Author" \
  --tags cuisine,snack

# 3. Review scripts/recipe-import/out/<slug>/recipes/*.json (or recipes-runN/)

# 4. Audit (required — writes review-pass.json; upload blocked without it)
node scripts/recipe-import/audit-recipes.mjs --book my-book
# or: --book my-book --run 2  →  out/my-book/recipes-run2/

# 5. Upload (8s delay between recipes; stops on 503/1102)
set -a; source .env; set +a
node scripts/recipe-import/upload.mjs --book my-book --base-url https://cookbook.megwyn.co.uk
```

## Guardrails

Upload is **blocked** unless `audit-recipes.mjs` has passed on the exact files being uploaded (`review-pass.json` + hash check + inline re-audit).

| Check | Purpose |
|-------|---------|
| `review-pass.json` | Proves audit ran after last JSON edit |
| Hash match | Any post-audit edit invalidates the stamp |
| Heuristic audit | Catches dashed table rows, jammed ingredients, flavor tags as steps |
| Upload delay | Avoids Cloudflare Worker CPU limit (503 / 1102) |

Do **not** use `upload.mjs --force` unless a human explicitly requests bypassing audit.

Forbidden: bulk generate scripts, uploading raw structure output, nested "write all recipes" agents, empty import probes. See `docs/agents/recipe-import.md`.

`--book` isolates outputs under `out/<slug>/`. You can also pass `--pages` / `--output` / `--dir` explicitly.

## Auth checklist

`POST /api/recipes/import` expects `Authorization: Bearer <MIGRATION_SECRET>`.

1. `.env` has `MIGRATION_SECRET=...` (no quotes unless quotes are part of the value).
2. Cloudflare Pages → **Production** secret named exactly `MIGRATION_SECRET`, same value.
3. Redeploy after changing the secret.
4. Probe with Node (avoids shell mangling of `!` etc.):

```bash
set -a; source .env; set +a
node -e '
const secret=process.env.MIGRATION_SECRET;
const res=await fetch("https://cookbook.megwyn.co.uk/api/recipes/import",{
  method:"POST",
  headers:{Authorization:`Bearer ${secret}`,"Content-Type":"application/json"},
  body:JSON.stringify({title:"Existing Recipe Title",source:"Book Title — Author",visibility:"private",ingredients:[],steps:[]})
});
const j=await res.json();
console.log({status:res.status,skipped:j.skipped,id:j.id,statusMessage:j.statusMessage});
'
```

Expect `200` + `skipped: true` for an already-imported title+source. `401` means Production secret ≠ `.env`.

## Import API

Generic route: `POST /api/recipes/import` (Bearer `MIGRATION_SECRET`).

- Creates recipe + ingredients (find-or-create by name)
- `imageUrl` left null
- Duplicate `title` + `source` is skipped
- Default visibility is `private` unless body sets `public`
- `source` is required in practice for idempotency; send it on every recipe

## Output dirs

`scripts/recipe-import/out/` and `scripts/recipe-import/spike-input/` are gitignored.
