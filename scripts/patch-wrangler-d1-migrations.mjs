/**
 * Patches the NuxtHub/Nitro-generated wrangler config:
 * 1. Deduplicates D1 bindings (NuxtHub can emit duplicates when CLOUDFLARE_D1_DATABASE_ID is set)
 * 2. Adds migrations_table and migrations_dir so `wrangler d1 migrations apply DB --remote` works
 *
 * Run after `nuxt build` in CI.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, relative } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const candidates = [
  join(root, 'dist', '_worker.js', 'wrangler.json'),
  join(root, 'dist', 'wrangler.json'),
  join(root, '.output', 'wrangler.json')
]
const wranglerPath = candidates.find(p => existsSync(p))
if (!wranglerPath) {
  console.error('Could not find wrangler.json in dist/_worker.js/, dist/, or .output/. Run nuxt build first.')
  process.exit(1)
}

let config
try {
  config = JSON.parse(readFileSync(wranglerPath, 'utf8'))
} catch (err) {
  console.error('Could not read wrangler config:', err.message)
  process.exit(1)
}

const d1 = config.d1_databases
if (!Array.isArray(d1) || d1.length === 0) {
  console.error('No d1_databases in wrangler config')
  process.exit(1)
}

// Deduplicate: if multiple entries share the same binding name, merge into one.
// Prefer the entry that already has a non-empty database_id, then layer on migrations config.
const seen = new Map()
for (const entry of d1) {
  const name = entry.binding
  const existing = seen.get(name)
  if (!existing) {
    seen.set(name, { ...entry })
  } else {
    // Merge: keep whichever has a real database_id; copy over migrations fields
    if (entry.database_id && entry.database_id !== '') {
      existing.database_id = entry.database_id
    }
    if (entry.migrations_table) existing.migrations_table = entry.migrations_table
    if (entry.migrations_dir) existing.migrations_dir = entry.migrations_dir
  }
}
config.d1_databases = Array.from(seen.values())

// Ensure the DB binding has migrations config
const db = config.d1_databases.find(e => e.binding === 'DB')
if (db) {
  db.migrations_table = db.migrations_table || '_hub_migrations'
  db.migrations_dir = db.migrations_dir || 'server/db/migrations/sqlite'
}

writeFileSync(wranglerPath, JSON.stringify(config, null, 2))

const deduped = d1.length - config.d1_databases.length
if (deduped > 0) {
  console.log(`Removed ${deduped} duplicate D1 binding(s)`)
}
console.log('Patched wrangler config with D1 migrations:', wranglerPath)

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `wrangler_config=${relative(root, wranglerPath)}\n`)
}
