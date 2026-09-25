#!/usr/bin/env bun
/**
 * One-time backfill: split packed / bare-URL `recipes.source` values into
 * clean label + `source_url`.
 *
 * Usage (local NuxtHub SQLite):
 *   bun scripts/backfill-recipe-source-url.mjs --dry-run
 *   bun scripts/backfill-recipe-source-url.mjs
 *   bun scripts/backfill-recipe-source-url.mjs --db /path/to/sqlite.db
 *
 * After production migration is applied, generate SQL for wrangler:
 *   bun scripts/backfill-recipe-source-url.mjs --dry-run --sql-out /tmp/source-url-backfill.sql
 *   bunx wrangler d1 execute DB --remote --file /tmp/source-url-backfill.sql
 *
 * Or export production rows first, point --db at a local copy, then apply the SQL file remotely.
 */
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Database } from 'bun:sqlite'
import { splitSourceAndUrl } from '../shared/utils/formatRecipeSource.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '..')
const DEFAULT_DB = path.join(ROOT, '.data', 'db', 'sqlite.db')

function parseArgs(argv) {
  const args = {
    dbPath: DEFAULT_DB,
    dryRun: false,
    sqlOut: ''
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--db') args.dbPath = path.resolve(argv[++i] || '')
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--sql-out') args.sqlOut = path.resolve(argv[++i] || '')
  }
  return args
}

function sqlString(value) {
  if (value == null) return 'NULL'
  return `'${String(value).replace(/'/g, "''")}'`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!existsSync(args.dbPath)) {
    console.error(`Database not found: ${args.dbPath}`)
    console.error('Start `bun run dev` once so migrations create .data/db/sqlite.db, then stop it and re-run.')
    process.exit(1)
  }

  const db = new Database(args.dbPath, { readonly: args.dryRun && !args.sqlOut })
  const hasColumn = db
    .query(`SELECT 1 AS ok FROM pragma_table_info('recipes') WHERE name = 'source_url'`)
    .get()
  if (!hasColumn) {
    console.error('recipes.source_url column missing. Apply migration 0008_add_recipe_source_url.sql first.')
    process.exit(1)
  }

  const rows = db
    .query(`SELECT id, title, source, source_url AS sourceUrl FROM recipes WHERE source IS NOT NULL AND TRIM(source) != ''`)
    .all()

  const updates = []
  for (const row of rows) {
    const split = splitSourceAndUrl(row.source)
    if (!split.sourceUrl) continue
    if (row.sourceUrl === split.sourceUrl && row.source === split.source) continue
    if (row.sourceUrl && row.sourceUrl !== split.sourceUrl) {
      console.warn(`SKIP ${row.id} (${row.title}): existing source_url differs`)
      continue
    }
    updates.push({
      id: row.id,
      title: row.title,
      fromSource: row.source,
      toSource: split.source,
      toSourceUrl: split.sourceUrl
    })
  }

  console.log(`Scanned ${rows.length} recipe(s) with source; ${updates.length} need backfill.`)

  if (args.sqlOut) {
    const sql = updates
      .map(
        (u) =>
          `UPDATE recipes SET source = ${sqlString(u.toSource)}, source_url = ${sqlString(u.toSourceUrl)} WHERE id = ${sqlString(u.id)};`
      )
      .join('\n')
    writeFileSync(args.sqlOut, sql + (sql ? '\n' : ''), 'utf8')
    console.log(`Wrote ${updates.length} UPDATE statement(s) to ${args.sqlOut}`)
  }

  if (args.dryRun) {
    for (const u of updates.slice(0, 20)) {
      console.log(`- ${u.title}`)
      console.log(`    source: ${JSON.stringify(u.fromSource)}`)
      console.log(`         -> ${JSON.stringify(u.toSource)}`)
      console.log(`    url   -> ${JSON.stringify(u.toSourceUrl)}`)
    }
    if (updates.length > 20) console.log(`… and ${updates.length - 20} more`)
    console.log('Dry run only — no rows updated.')
    return
  }

  const stmt = db.prepare(
    `UPDATE recipes SET source = $source, source_url = $sourceUrl WHERE id = $id`
  )
  const apply = db.transaction((list) => {
    for (const u of list) {
      stmt.run({
        $id: u.id,
        $source: u.toSource,
        $sourceUrl: u.toSourceUrl
      })
    }
  })
  apply(updates)
  console.log(`Updated ${updates.length} recipe(s).`)
}

main()
