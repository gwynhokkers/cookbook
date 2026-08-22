# Recipe sync (production D1 → local dev)

Pull filtered recipe bundles from Cloudflare D1 into the local NuxtHub SQLite database at `.data/db/sqlite.db`.

This is the inverse of [`scripts/recipe-import/`](../recipe-import/README.md), which pushes local OCR drafts **to** production.

## Prerequisites

1. **Wrangler CLI** installed and logged in (`wrangler login`) with D1 read access on the account.
2. **Local database exists** — run `bun run dev` once so migrations create `.data/db/sqlite.db`, then stop the dev server before loading (avoids file-lock issues).
3. **Private recipes locally** — set `NUXT_DEV_AUTH=true` in `.env`, restart dev, and sign in at `/login` as the Editor or Admin dev persona.

Images are **not** copied to local blob storage. Relative production paths are rewritten to absolute URLs (default base: `https://cookbook.megwyn.co.uk`) so local dev can load them from production.

## Quick start

Pull a book by exact `source` string (matches production `recipes.source`):

```bash
bun run sync:pull -- \
  --source "Book Title — Author" \
  --visibility all
```

Stop the dev server, then load:

```bash
bun run sync:load -- --dir scripts/recipe-sync/out/book-title-author
bun run dev
```

Or pull + load in one step (still stop dev server first):

```bash
bun run sync:recipes -- --source "Book Title — Author" --visibility all
```

## Commands

### Pull from remote D1

```bash
node scripts/recipe-sync/pull.mjs \
  --source "Book Title — Author" \
  --tag thai \
  --visibility all \
  --limit 50 \
  --slug my-book \
  --base-url https://cookbook.megwyn.co.uk \
  --dry-run
```

| Flag | Description |
|------|-------------|
| `--source` | Exact match on `recipes.source` |
| `--tag` | Recipe must include this tag (JSON array) |
| `--visibility` | `public`, `private`, or `all` (default: `all` when `--source` is set, else `public`) |
| `--limit` | Max recipes to export |
| `--ids` | Comma-separated recipe IDs |
| `--slug` | Output folder under `out/<slug>/` (default: slugified source/tag) |
| `--out-dir` | Override output directory |
| `--env` | Wrangler env (default: `production`) |
| `--database-id` | Override D1 database ID (default: read from `wrangler.jsonc`) |
| `--base-url` | Prefix for relative image URLs in snapshot |
| `--dry-run` | Print SQL and counts without writing `snapshot.json` |

Writes `scripts/recipe-sync/out/<slug>/snapshot.json` (gitignored).

### Load into local SQLite

```bash
node scripts/recipe-sync/load.mjs \
  --dir scripts/recipe-sync/out/my-book \
  --prune-source "Book Title — Author" \
  --dry-run
```

| Flag | Description |
|------|-------------|
| `--dir` | Directory containing `snapshot.json` |
| `--snapshot` | Path to a specific snapshot file |
| `--db` | Local DB path (default: `.data/db/sqlite.db`) |
| `--base-url` | Prefix for relative image URLs during load |
| `--prune-source` | Delete existing local recipes with this source before upserting |
| `--dry-run` | Print counts only |

Upserts by primary key (`recipes.id`, `ingredients.id`, `recipe_ingredients.id`). Re-running load for the same snapshot is idempotent.

## Manual D1 probe

```bash
wrangler d1 execute DB --env production --remote --json \
  --command "SELECT id, title, source, visibility FROM recipes WHERE source = 'Book Title — Author' LIMIT 5"
```

## What is not synced

- Users, sessions, or auth tables
- R2 / local blob images (URLs point at production)
- Changes back to production (keep using `scripts/recipe-import/upload.mjs` for that)
