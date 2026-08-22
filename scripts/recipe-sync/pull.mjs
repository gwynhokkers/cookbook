#!/usr/bin/env node
/**
 * Export recipe bundles from remote Cloudflare D1 via wrangler.
 *
 * Usage:
 *   node scripts/recipe-sync/pull.mjs \
 *     --source "Book Title — Author" \
 *     --visibility all \
 *     --slug my-book
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
const CHUNK_SIZE = 80

function parseArgs(argv) {
  const args = {
    source: '',
    tag: '',
    visibility: '',
    limit: 0,
    ids: [],
    slug: '',
    outDir: '',
    baseUrl: DEFAULT_BASE,
    env: DEFAULT_ENV,
    databaseId: '',
    dryRun: false
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--source') args.source = String(argv[++i] || '').trim()
    else if (a === '--tag') args.tag = String(argv[++i] || '').trim()
    else if (a === '--visibility') args.visibility = String(argv[++i] || '').trim().toLowerCase()
    else if (a === '--limit') args.limit = Number(argv[++i] || 0)
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

  if (!args.slug) {
    args.slug = slugify(args.source || args.tag || 'recipes')
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

function wranglerCommand() {
  const local = path.join(ROOT, 'node_modules', '.bin', 'wrangler')
  if (existsSync(local)) return local
  return 'npx'
}

function wranglerArgs(args, command) {
  const cmd = wranglerCommand()
  const base = cmd.endsWith('wrangler')
    ? [cmd]
    : [cmd, 'wrangler']

  return [
    ...base,
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

function parseWranglerJson(stdout) {
  const trimmed = String(stdout || '').trim()
  if (!trimmed) return []

  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error(`Could not parse wrangler JSON output:\n${trimmed.slice(0, 500)}`)
  }

  const rows = []
  const walk = (node) => {
    if (!node) return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (typeof node !== 'object') return

    if (Array.isArray(node.results)) {
      for (const result of node.results) {
        if (result && typeof result === 'object') {
          if (Array.isArray(result.results)) {
            rows.push(...result.results)
          }
          walk(result.results)
        }
      }
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') walk(value)
    }
  }

  walk(parsed)

  const deduped = []
  const seen = new Set()
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const key = JSON.stringify(row)
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(row)
  }

  return deduped
}

function executeQuery(args, command) {
  const spawnArgs = wranglerArgs(args, command)
  const cmd = spawnArgs[0]
  const rest = spawnArgs.slice(1)
  const result = spawnSync(cmd, rest, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })

  if (result.error) {
    throw new Error(`Failed to run wrangler: ${result.error.message}`)
  }

  if (result.status !== 0) {
    throw new Error(
      `wrangler d1 execute failed (exit ${result.status}):\n${result.stderr || result.stdout}`
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
  console.log(`Querying remote D1 (${args.env}) for recipes...`)
  if (args.dryRun) {
    console.log(recipesQuery)
  }

  const recipeRows = executeQuery(args, recipesQuery)
  const recipeIds = recipeRows.map((row) => row.id).filter(Boolean)

  let recipeIngredientRows = []
  if (recipeIds.length > 0) {
    for (const ids of chunk(recipeIds, CHUNK_SIZE)) {
      const query = buildRecipeIngredientsQuery(ids)
      recipeIngredientRows.push(...executeQuery(args, query))
    }
  }

  const ingredientIds = [...new Set(recipeIngredientRows.map((row) => row.ingredient_id).filter(Boolean))]
  let ingredientRows = []
  if (ingredientIds.length > 0) {
    for (const ids of chunk(ingredientIds, CHUNK_SIZE)) {
      const query = buildIngredientsQuery(ids)
      ingredientRows.push(...executeQuery(args, query))
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
