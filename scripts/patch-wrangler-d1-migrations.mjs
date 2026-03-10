/**
 * Patches the NuxtHub/Nitro-generated wrangler config to add D1 migrations_table
 * and migrations_dir so `wrangler d1 migrations apply DB --remote` can find migrations.
 * Run after `nuxt build` in CI. Supports dist/_worker.js/wrangler.json (Pages), dist/wrangler.json, .output/wrangler.json.
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
  console.error('No d1_databases in dist/wrangler.json')
  process.exit(1)
}

d1[0].migrations_table = '_hub_migrations'
// migrations_dir is relative to project root (cwd when wrangler runs)
d1[0].migrations_dir = 'server/db/migrations/sqlite'

writeFileSync(wranglerPath, JSON.stringify(config, null, 2))
console.log('Patched wrangler config with D1 migrations:', wranglerPath)
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `wrangler_config=${relative(root, wranglerPath)}\n`)
}
