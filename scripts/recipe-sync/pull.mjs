#!/usr/bin/env node
/**
 * Export recipe bundles from remote Cloudflare D1 via wrangler.
 *
 * Usage:
 *   node scripts/recipe-sync/pull.mjs --visibility all --limit 20
 *   node scripts/recipe-sync/pull.mjs --source "Book Title — Author" --visibility all
 *   node scripts/recipe-sync/pull.mjs --visibility all --limit 20 --offset 20 --slug recipes-p2
 */
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import stripJsonComments from 'strip-json-comments'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '..', '..')
const DEFAULT_BASE = 'https://cookbook.megwyn.co.uk'
const DEFAULT_ENV = 'production'
const DEFAULT_LIMIT = 20
const CHUNK_SIZE = 40

function parseArgs(argv) {
  const args = {
    source: '',
    tag: '',
    visibility: '',
    limit: null,
    offset: 0,
    ids: [],
    slug: '',
    outDir: '',
    baseUrl: DEFAULT_BASE,
    env: DEFAULT_ENV,
    databaseId: '',
    dryRun: false,
    all: false
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--source') args.source = String(argv[++i] || '').trim()
    else if (a === '--tag') args.tag = String(argv[++i] || '').trim()
    else if (a === '--visibility') args.visibility = String(argv[++i] || '').trim().toLowerCase()
    else if (a === '--limit') args.limit = Number(argv[++i] || 0)
    else if (a === '--offset') args.offset = Number(argv[++i] || 0)
    else if (a === '--all') args.all = true
    else if (a === '--ids') {
      args.ids = String(argv[++i] || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    }
    else if (a === '--slug') args.slug = String(argv[++i] || '').trim()
    else if (a === '--out-dir') args.outDir = path.resolve(argv[++i] || '')
    else if (a === '--base-url') args.baseUrl = String(argv[++i] || DEFAULT_BASE).replace(/\/$/, '')
    else if (a === '--env') args.env = String(argv[++i] || DEFAULT_ENV).trim()
    else if (a === '--database-id') args.databaseId = String(argv[++i] || '').trim()
    else if (a === '--dry-run') args.dryRun = true
  }

  if (!args.visibility) {
    args.visibility = args.source ? 'all' : 'public'
  }

  if (!['public', 'private', 'all'].includes(args.visibility)) {
    throw new Error('--visibility must be public, private, or all')
  }

  // Default to a small batch so full-table pulls do not time out / overflow wrangler JSON.
  if (args.all) {
    args.limit = 0
  } else if (args.limit == null || Number.isNaN(args.limit)) {
    args.limit = DEFAULT_LIMIT
  } else if (args.limit < 0) {
    throw new Error('--limit must be >= 0 (use --all for no limit)')
  }

  if (args.offset < 0 || Number.isNaN(args.offset)) {
    throw new Error('--offset must be >= 0')
  }

  if (!args.slug) {
    const base = slugify(args.source || args.tag || 'recipes')
    args.slug = args.offset > 0 ? `${base}-offset-${args.offset}` : base
  }

  if (!args.outDir) {
    args.outDir = path.join(HERE, 'out', args.slug)
  }

  return args
}

function slugify(input) {
  return String(input || 'recipes')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'recipes'
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function readDatabaseId(envName) {
  const wranglerPath = path.join(ROOT, 'wrangler.jsonc')
  if (!existsSync(wranglerPath)) {
    throw new Error('wrangler.jsonc not found in project root')
  }

  const raw = readFileSync(wranglerPath, 'utf8')
  const config = JSON.parse(stripJsonComments(raw))
  const envConfig = config?.env?.[envName]
  const db = envConfig?.d1_databases?.find((entry) => entry.binding === 'DB')
  if (!db?.database_id) {
    throw new Error(`Could not find DB.database_id for env "${envName}" in wrangler.jsonc`)
  }
  return db.database_id
}

function wranglerBin() {
  const local = path.join(ROOT, 'node_modules', '.bin', 'wrangler')
  if (existsSync(local)) return { cmd: local, prefix: [] }
  return { cmd: 'npx', prefix: ['--yes', 'wrangler'] }
}

function wranglerArgs(args, command) {
  const { cmd, prefix } = wranglerBin()
  return [
    cmd,
    ...prefix,
    'd1',
    'execute',
    'DB',
    '--env',
    args.env,
    '--remote',
    '--json',
    '--command',
    command
  ]
}

/**
 * Wrangler `--json` returns: [{ results: [...rows], success, meta }]
 * Older/nested shapes may wrap again; accept both.
 */
function parseWranglerJson(stdout) {
  const trimmed = String(stdout || '').trim()
  if (!trimmed) return []

  // npx may occasionally leak non-JSON lines; keep from first `[` or `{`
  const start = Math.min(
    ...['[', '{']
      .map((ch) => {
        const idx = trimmed.indexOf(ch)
        return idx === -1 ? Number.POSITIVE_INFINITY : idx
      })
  )
  if (!Number.isFinite(start)) {
    throw new Error(`Could not parse wrangler JSON output:\n${trimmed.slice(0, 500)}`)
  }

  let parsed
  try {
    parsed = JSON.parse(trimmed.slice(start))
  } catch {
    throw new Error(`Could not parse wrangler JSON output:\n${trimmed.slice(0, 500)}`)
  }

  const rows = []
  const seen = new Set()

  const pushRows = (candidate) => {
    if (!Array.isArray(candidate)) return
    for (const row of candidate) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue
      // Skip wrangler envelope objects
      if ('success' in row && 'meta' in row) continue
      if ('results' in row && 'success' in row) continue
      const key = JSON.stringify(row)
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(row)
    }
  }

  const walk = (node) => {
    if (!node) return
    if (Array.isArray(node)) {
      // Top-level array of envelopes, or a bare row array
      const first = node[0]
      if (first && typeof first === 'object' && Array.isArray(first.results)) {
        for (const item of node) walk(item)
        return
      }
      pushRows(node)
      return
    }
    if (typeof node !== 'object') return

    if (Array.isArray(node.results)) {
      const first = node.results[0]
      const nestedEnvelope = first && typeof first === 'object' && Array.isArray(first.results)
      if (nestedEnvelope) {
        for (const item of node.results) walk(item)
      } else {
        pushRows(node.results)
      }
    }
  }

  walk(parsed)
  return rows
}

function executeQuery(args, command) {
  const spawnArgs = wranglerArgs(args, command)
  const cmd = spawnArgs[0]
  const rest = spawnArgs.slice(1)
  const result = spawnSync(cmd, rest, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024
  })

  if (result.error) {
    throw new Error(`Failed to run wrangler: ${result.error.message}`)
  }

  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout]
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .join('\n---\n')
    throw new Error(
      `wrangler d1 execute failed (exit ${result.status}).`
      + (args.limit === 0
        ? ' Try a smaller batch: --limit 20 (default) or --limit 20 --offset 20.'
        : ` Try lowering --limit (currently ${args.limit}).`)
      + `\n${detail || '(no wrangler output)'}`
    )
  }

  return parseWranglerJson(result.stdout)
}

function buildRecipesQuery(args) {
  const conditions = ['1=1']

  if (args.source) {
    conditions.push(`source = ${sqlString(args.source)}`)
  }

  if (args.visibility !== 'all') {
    conditions.push(`visibility = ${sqlString(args.visibility)}`)
  }

  if (args.tag) {
    conditions.push(
      `EXISTS (SELECT 1 FROM json_each(recipes.tags) WHERE value = ${sqlString(args.tag)})`
    )
  }

  if (args.ids.length > 0) {
    const inList = args.ids.map((id) => sqlString(id)).join(', ')
    conditions.push(`id IN (${inList})`)
  }

  let sql = `
SELECT
  id,
  title,
  description,
  image_url,
  date,
  tags,
  source,
  servings,
  steps,
  visibility,
  author_id,
  created_at,
  updated_at
FROM recipes
WHERE ${conditions.join(' AND ')}
ORDER BY date DESC
`.trim()

  if (args.limit > 0) {
    sql += `\nLIMIT ${Math.floor(args.limit)}`
    if (args.offset > 0) {
      sql += `\nOFFSET ${Math.floor(args.offset)}`
    }
  } else if (args.offset > 0) {
    throw new Error('--offset requires --limit (or omit --all)')
  }

  return sql
}

function buildRecipeIngredientsQuery(recipeIds) {
  const inList = recipeIds.map((id) => sqlString(id)).join(', ')
  return `
SELECT
  id,
  recipe_id,
  ingredient_id,
  amount,
  unit,
  notes,
  "order",
  created_at,
  updated_at
FROM recipe_ingredients
WHERE recipe_id IN (${inList})
ORDER BY recipe_id, CAST("order" AS INTEGER)
`.trim()
}

function buildIngredientsQuery(ingredientIds) {
  const inList = ingredientIds.map((id) => sqlString(id)).join(', ')
  return `
SELECT
  id,
  name,
  spoonacular_ingredient_id,
  spoonacular_data,
  created_at,
  updated_at
FROM ingredients
WHERE id IN (${inList})
ORDER BY name
`.trim()
}

function chunk(values, size) {
  const out = []
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size))
  }
  return out
}

function normalizeImageUrl(imageUrl, baseUrl) {
  if (!imageUrl) return null
  const value = String(imageUrl).trim()
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith('/')) return `${baseUrl}${value}`
  return value
}

function mapRecipe(row, baseUrl) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    imageUrl: normalizeImageUrl(row.image_url, baseUrl),
    date: row.date,
    tags: row.tags ?? '[]',
    source: row.source ?? null,
    servings: row.servings ?? null,
    steps: row.steps ?? '[]',
    visibility: row.visibility ?? 'public',
    authorId: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapIngredient(row) {
  return {
    id: row.id,
    name: row.name,
    spoonacularIngredientId: row.spoonacular_ingredient_id ?? null,
    spoonacularData: row.spoonacular_data ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapRecipeIngredient(row) {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    ingredientId: row.ingredient_id,
    amount: row.amount,
    unit: row.unit,
    notes: row.notes ?? null,
    order: row.order ?? '0',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const databaseId = args.databaseId || readDatabaseId(args.env)

  const recipesQuery = buildRecipesQuery(args)
  const limitLabel = args.limit > 0
    ? `limit=${args.limit} offset=${args.offset}`
    : 'limit=none (--all)'
  console.log(`Querying remote D1 (${args.env}) for recipes (${limitLabel})...`)
  if (args.dryRun) {
    console.log(recipesQuery)
  }

  const recipeRows = executeQuery(args, recipesQuery)
  const recipeIds = recipeRows.map((row) => row.id).filter(Boolean)

  let recipeIngredientRows = []
  if (recipeIds.length > 0) {
    for (const ids of chunk(recipeIds, CHUNK_SIZE)) {
      recipeIngredientRows.push(...executeQuery(args, buildRecipeIngredientsQuery(ids)))
    }
  }

  const ingredientIds = [...new Set(
    recipeIngredientRows.map((row) => row.ingredient_id).filter(Boolean)
  )]
  let ingredientRows = []
  if (ingredientIds.length > 0) {
    for (const ids of chunk(ingredientIds, CHUNK_SIZE)) {
      ingredientRows.push(...executeQuery(args, buildIngredientsQuery(ids)))
    }
  }

  const snapshot = {
    meta: {
      pulledAt: new Date().toISOString(),
      env: args.env,
      databaseId,
      baseUrl: args.baseUrl,
      filters: {
        source: args.source || null,
        tag: args.tag || null,
        visibility: args.visibility,
        limit: args.limit || null,
        offset: args.offset || 0,
        ids: args.ids
      }
    },
    recipes: recipeRows.map((row) => mapRecipe(row, args.baseUrl)),
    ingredients: ingredientRows.map(mapIngredient),
    recipeIngredients: recipeIngredientRows.map(mapRecipeIngredient)
  }

  console.log(
    `Found ${snapshot.recipes.length} recipe(s), ${snapshot.recipeIngredients.length} recipe ingredient(s), ${snapshot.ingredients.length} ingredient(s).`
  )

  if (args.limit > 0 && snapshot.recipes.length === args.limit) {
    const nextOffset = args.offset + args.limit
    console.log(
      `Batch full. Next batch: bun run sync:pull -- --visibility ${args.visibility}`
      + (args.source ? ` --source ${JSON.stringify(args.source)}` : '')
      + ` --limit ${args.limit} --offset ${nextOffset}`
    )
  }

  if (args.dryRun) {
    console.log('Dry run — snapshot not written.')
    return
  }

  await mkdir(args.outDir, { recursive: true })
  const snapshotPath = path.join(args.outDir, 'snapshot.json')
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${snapshotPath}`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
