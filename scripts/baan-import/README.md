# Baan bulk import (local Docling)

Offline pipeline: OCR cookbook page photos with Docling, split into reviewable recipe JSON, then POST to `/api/recipes/import`. No recipe images are uploaded.

Confirmed Docling flags (Apple Vision via `--ocr-engine ocrmac`, ~7–10s per page on this machine; clearly better than RapidOCR on these phone scans):

```bash
docling convert --from image --to md --ocr --ocr-engine ocrmac --image-export-mode placeholder --output DIR SOURCE
```

Food-only photos may still OCR thin; text pages produce markdown with `##` titles. Occasional typos remain (e.g. `tosp` for `tbsp`) — review drafts before upload.

## Agent prompt (reuse for each batch)

Copy/paste this into Cursor when importing the next batch:

```text
Run the next Baan cookbook import batch using scripts/baan-import.

Context:
- Source scans: "/Users/gwynforhockridge/Library/CloudStorage/ProtonDrive-gwyn@inkythesquid.co.uk-folder/Books/Cooking/Baan - Kay Plunkett-Hogge"
- OCR: node scripts/baan-import/ocr.mjs (ocrmac)
- Structure: node scripts/baan-import/structure_recipes.mjs
- Upload: node scripts/baan-import/upload.mjs --base-url https://cookbook.megwyn.co.uk
- Auth: load MIGRATION_SECRET from .env (never print it). Prefer `set -a; source .env; set +a` then run upload.mjs so shell does not mangle special characters in the secret.
- Recipes must stay visibility: private, source: "Baan — Kay Plunkett-Hogge", no images.

Do this:
1. OCR the next batch with --limit N (or continue after pages already in scripts/baan-import/out/pages). Prefer ~10–15 new sequential IMG* pages per batch.
2. Structure into scripts/baan-import/out/recipes/*.json.
3. BEFORE uploading: review every draft against the OCR markdown. Fix titles, descriptions, ingredients (amount/unit/name/notes), and steps. Merge duplicate page scans of the same recipe. Drop empty shells, chapter headers, and incomplete/scrambled fragments. Rewrite JSON files in place as needed.
4. Upload only the reviewed recipes.
5. End with a summary that includes:
   - pages OCR’d / failed empty
   - recipes uploaded (title + id)
   - recipes skipped and why
   - list of corrections you made during review
   - any auth or API errors

Do not auto-upload raw structure output without the review step. Do not commit secrets or out/ artefacts.
```

Suggested batch size: `--limit 12` (or the next 12 `IMG*` files not yet processed). Keep a note of the last filename processed so the next batch can skip earlier pages.

## Auth checklist

`POST /api/recipes/import` expects:

```http
Authorization: Bearer <MIGRATION_SECRET>
```

1. Local `.env` must contain `MIGRATION_SECRET=...` (no quotes unless the quotes are part of the value).
2. Cloudflare Pages → project → **Settings → Environment variables** → **Production** secret named exactly `MIGRATION_SECRET`, value identical to `.env`.
3. Redeploy after changing the secret.
4. Test with Node (avoids shell history expansion on `!` etc.):

```bash
set -a; source .env; set +a
node -e '
const secret=process.env.MIGRATION_SECRET;
const res=await fetch("https://cookbook.megwyn.co.uk/api/recipes/import",{
  method:"POST",
  headers:{Authorization:`Bearer ${secret}`,"Content-Type":"application/json"},
  body:JSON.stringify({title:"Prayoon'\''s Tod Mun Pla",source:"Baan — Kay Plunkett-Hogge",visibility:"private",ingredients:[],steps:[]})
});
const j=await res.json();
console.log({status:res.status,skipped:j.skipped,id:j.id,statusMessage:j.statusMessage});
'
```

Expect `status: 200` and `skipped: true` for an already-imported title. `401` means Production secret ≠ `.env` (or wrong env / name).

## 1. OCR

```bash
node scripts/baan-import/ocr.mjs \
  --source "/Users/gwynforhockridge/Library/CloudStorage/ProtonDrive-gwyn@inkythesquid.co.uk-folder/Books/Cooking/Baan - Kay Plunkett-Hogge" \
  --output scripts/baan-import/out/pages
```

`--limit N` converts only the first N images (sequential `IMG*` first). Writes `pages.jsonl`.

## 2. Structure drafts

```bash
node scripts/baan-import/structure_recipes.mjs \
  --pages scripts/baan-import/out/pages \
  --output scripts/baan-import/out/recipes
```

## 3. Review

Edit `scripts/baan-import/out/recipes/*.json`. Fix titles, merge/split recipes, amounts/units. Do not upload raw OCR to production without this step. `index.json` is a summary.

## 4. Import API

Requires `MIGRATION_SECRET` (same as `/api/migrate`). Deploy the app so `POST /api/recipes/import` exists.

Recipes are created as `visibility: private`, `source: "Baan — Kay Plunkett-Hogge"`, `imageUrl: null`. Duplicate `title` + `source` is skipped.

## 5. Upload

```bash
set -a; source .env; set +a

# dry-run
node scripts/baan-import/upload.mjs --dry-run --base-url http://localhost:3000

# production
node scripts/baan-import/upload.mjs --base-url https://cookbook.megwyn.co.uk
```

`--limit N` uploads the first N drafts. Failures are logged to `out/recipes/upload-results.json`; the script continues. `index.json` and `upload-results.json` are ignored as upload inputs.

## Output dirs

`out/` and `spike-input/` are gitignored.
