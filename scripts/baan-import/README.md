# Baan bulk import (local Docling)

Offline pipeline: OCR cookbook page photos with Docling, split into reviewable recipe JSON, then POST to `/api/recipes/import`. No recipe images are uploaded.

Confirmed Docling flags (Apple Vision via `--ocr-engine ocrmac`, ~7–10s per page on this machine; clearly better than RapidOCR on these phone scans):

```bash
docling convert --from image --to md --ocr --ocr-engine ocrmac --image-export-mode placeholder --output DIR SOURCE
```

Food-only photos may still OCR thin; text pages produce markdown with `##` titles. Occasional typos remain (e.g. `tosp` for `tbsp`) — review drafts before upload.

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
# dry-run
MIGRATION_SECRET=your-secret node scripts/baan-import/upload.mjs --dry-run --base-url http://localhost:3000

# local
MIGRATION_SECRET=your-secret node scripts/baan-import/upload.mjs --base-url http://localhost:3000 --limit 2

# production
MIGRATION_SECRET=your-secret node scripts/baan-import/upload.mjs --base-url https://cookbook.megwyn.co.uk
```

`--limit N` uploads the first N drafts. Failures are logged to `out/recipes/upload-results.json`; the script continues.

## Output dirs

`out/` and `spike-input/` are gitignored.
