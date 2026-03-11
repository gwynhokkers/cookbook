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

// Merge from repo wrangler.jsonc FIRST. Nitro's generated config may not include d1_databases/vars;
// the repo has them under env.production / env.preview.
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
    const isPreview = process.env.CF_PAGES_BRANCH && process.env.CF_PAGES_PRODUCTION_BRANCH && process.env.CF_PAGES_BRANCH !== process.env.CF_PAGES_PRODUCTION_BRANCH
    const envBlock = isPreview && repoConfig.env?.preview ? repoConfig.env.preview : repoConfig.env?.production || {}
    const source = { ...repoConfig, ...envBlock }
    if (source.name) config.name = source.name
    // Do NOT merge pages_build_output_dir from repo (./dist resolves wrong when config is in dist/_worker.js/).
    if (source.compatibility_date) config.compatibility_date = source.compatibility_date
    if (Array.isArray(source.d1_databases) && source.d1_databases.length > 0) {
      config.d1_databases = source.d1_databases
    }
    if (Array.isArray(source.kv_namespaces) && source.kv_namespaces.length > 0) {
      config.kv_namespaces = source.kv_namespaces
    }
    if (Array.isArray(source.r2_buckets) && source.r2_buckets.length > 0) {
      config.r2_buckets = source.r2_buckets
    }
    if (source.ai && typeof source.ai === 'object') {
      config.ai = source.ai
    }
    if (source.vars && typeof source.vars === 'object') {
      config.vars = { ...config.vars, ...source.vars }
    }
    console.log('Merged vars and bindings from wrangler.jsonc into build output')
  }
}

// When config lives in dist/_worker.js/, pages_build_output_dir must be ".." so it points to dist (Cloudflare resolves relative to config file).
if (wranglerPath.includes('_worker.js')) {
  config.pages_build_output_dir = '..'
}

// Now ensure we have D1 and run dedupe / migrations config
let d1 = config.d1_databases
if (!Array.isArray(d1) || d1.length === 0) {
  console.error('No d1_databases in wrangler config (and none in repo wrangler.jsonc env.production/env.preview).')
  process.exit(1)
}

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
  // Nitro emits sqlite migrations to dist/_worker.js/db/migrations/sqlite (no "server/").
  // When patching build output, always use this path so wrangler finds them (repo wrangler.jsonc
  // uses server/db/... which is correct for local `wrangler d1 migrations apply --env production`).
  if (wranglerPath.includes('_worker.js')) {
    db.migrations_dir = 'db/migrations/sqlite'
  } else {
    db.migrations_dir = db.migrations_dir || 'server/db/migrations/sqlite'
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
