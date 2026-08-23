# Recipe sync (production D1 → local dev)

Pull filtered recipe bundles from Cloudflare D1 into the local NuxtHub SQLite database at `.data/db/sqlite.db`.

This is the inverse of [`scripts/recipe-import/`](../recipe-import/README.md), which pushes local OCR drafts **to** production.

## Prerequisites

1. **Wrangler CLI** logged in (`wrangler login`) with D1 read access on the account.
2. **Local database exists** — run `bun run dev` once so migrations create `.data/db/sqlite.db`, then **stop the dev server** before loading (avoids file-lock issues).
3. **Private recipes locally** — set `NUXT_DEV_AUTH=true` in `.env`, restart dev, and sign in at `/login` as the Editor or Admin persona.

Images are **not** copied. Relative paths are rewritten to absolute production URLs (default base: `https://cookbook.megwyn.co.uk`).

## Quick start (batched)

Production has many recipes; full dumps can time out. **Default batch size is 20.**

```bash
# Pull first 20 recipes (any visibility)
bun run sync:pull -- --visibility all --limit 20

# Stop bun run dev, then load
bun run sync:load -- --dir scripts/recipe-sync/out/recipes
bun run dev
```

Next batch:

```bash
bun run sync:pull -- --visibility all --limit 20 --offset 20
bun run sync:load -- --dir scripts/recipe-sync/out/recipes-offset-20
```

Or pull + load in one step (dev server still must be stopped):

```bash
bun run sync:recipes -- --visibility all --limit 20
```

## Pull a single book

```bash
bun run sync:pull -- \
  --source "Hot Sour Salty Sweet — Jeffrey Alford" \
  --visibility all
```

`--source` still defaults to batches of 20 unless you pass `--all` (only use `--all` for small sources).

## Flags

| Flag | Description |
|------|-------------|
| `--source` | Exact match on `recipes.source` |
| `--tag` | Recipe must include this tag |
| `--visibility` | `public`, `private`, or `all` (default: `all` with `--source`, else `public`) |
| `--limit` | Max recipes per pull (**default: 20**) |
| `--offset` | Skip N recipes (for paging with `--limit`) |
| `--all` | No `LIMIT` (can fail / time out on large DBs) |
| `--ids` | Comma-separated recipe IDs |
| `--slug` | Output folder under `out/<slug>/` |
| `--out-dir` | Override output directory |
| `--env` | Wrangler env (default: `production`) |
| `--base-url` | Prefix for relative image URLs |
| `--dry-run` | Print SQL / counts without writing `snapshot.json` |

Writes `scripts/recipe-sync/out/<slug>/snapshot.json` (gitignored).

### Load flags

| Flag | Description |
|------|-------------|
| `--dir` | Directory containing `snapshot.json` |
| `--snapshot` | Path to a specific snapshot file |
| `--db` | Local DB path (default: `.data/db/sqlite.db`) |
| `--prune-source` | Delete local recipes with this source before upsert |
| `--dry-run` | Print counts only |

## Manual D1 probe

```bash
npx wrangler d1 execute DB --env production --remote --json \
  --command "SELECT id, title, source, visibility FROM recipes ORDER BY date DESC LIMIT 5"
```

## What is not synced

- Users, sessions, or auth tables
- R2 / local blob image bytes (URLs point at production)
- Changes back to production (use `scripts/recipe-import/upload.mjs`)
