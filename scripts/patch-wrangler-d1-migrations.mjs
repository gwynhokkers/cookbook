/**
 * Patches the NuxtHub/Nitro-generated wrangler config (in dist/ or .output/).
 * Does NOT touch your repo's wrangler.jsonc — only the build output.
 *
 * 1. Deduplicates D1 bindings and adds migrations_table / migrations_dir for `wrangler d1 migrations apply`.
 * 2. Merges vars and bindings (KV, R2, AI, name, compatibility_date, pages_build_output_dir) from the
 *    repo's wrangler.jsonc into the generated config so the deployed Worker gets them. Dashboard Secrets
 *    (GITHUB_CLIENT_SECRET, etc.) are still set in Cloudflare and injected at runtime.
 *
 * Run after `nuxt build` in CI.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, relative } from 'path'
import stripJsonComments from 'strip-json-comments'

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
const seen = new Map()
for (const entry of d1) {
  const name = entry.binding
  const existing = seen.get(name)
  if (!existing) {
    seen.set(name, { ...entry })
  } else {
    if (entry.database_id && entry.database_id !== '') {
      existing.database_id = entry.database_id
    }
    if (entry.migrations_table) existing.migrations_table = entry.migrations_table
    if (entry.migrations_dir) existing.migrations_dir = entry.migrations_dir
  }
}
config.d1_databases = Array.from(seen.values())

const db = config.d1_databases.find(e => e.binding === 'DB')
if (db) {
  db.migrations_table = db.migrations_table || '_hub_migrations'
  db.migrations_dir = db.migrations_dir || 'server/db/migrations/sqlite'
}

// Merge vars and bindings from repo wrangler.jsonc so the deployed Worker gets them (Pages uses the build-output wrangler).
const repoWranglerPath = join(root, 'wrangler.jsonc')
if (existsSync(repoWranglerPath)) {
  let repoConfig
  try {
    const raw = readFileSync(repoWranglerPath, 'utf8')
    repoConfig = JSON.parse(stripJsonComments(raw))
  } catch (err) {
    console.warn('Could not parse repo wrangler.jsonc (skipping merge):', err.message)
  }
  if (repoConfig) {
    if (repoConfig.name) config.name = repoConfig.name
    if (repoConfig.pages_build_output_dir) config.pages_build_output_dir = repoConfig.pages_build_output_dir
    if (repoConfig.compatibility_date) config.compatibility_date = repoConfig.compatibility_date
    if (Array.isArray(repoConfig.kv_namespaces) && repoConfig.kv_namespaces.length > 0) {
      config.kv_namespaces = repoConfig.kv_namespaces
    }
    if (Array.isArray(repoConfig.r2_buckets) && repoConfig.r2_buckets.length > 0) {
      config.r2_buckets = repoConfig.r2_buckets
    }
    if (repoConfig.ai && typeof repoConfig.ai === 'object') {
      config.ai = repoConfig.ai
    }
    if (repoConfig.vars && typeof repoConfig.vars === 'object') {
      config.vars = { ...config.vars, ...repoConfig.vars }
    }
    console.log('Merged vars and bindings from wrangler.jsonc into build output')
  }
}

writeFileSync(wranglerPath, JSON.stringify(config, null, 2))

const deduped = d1.length - config.d1_databases.length
if (deduped > 0) {
  console.log(`Removed ${deduped} duplicate D1 binding(s)`)
}
console.log('Patched wrangler config:', wranglerPath)

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `wrangler_config=${relative(root, wranglerPath)}\n`)
}
