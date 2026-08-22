#!/usr/bin/env node
/**
 * Upsert a recipe-sync snapshot into local NuxtHub SQLite.
 *
 * Usage:
 *   node scripts/recipe-sync/load.mjs --dir scripts/recipe-sync/out/my-book
 *   node scripts/recipe-sync/load.mjs --snapshot path/to/snapshot.json --prune-source "Book — Author"
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '..', '..')
const DEFAULT_DB = path.join(ROOT, '.data', 'db', 'sqlite.db')
const DEFAULT_BASE = 'https://cookbook.megwyn.co.uk'

function parseArgs(argv) {
  const args = {
    dir: '',
    snapshot: '',
    dbPath: DEFAULT_DB,
    baseUrl: DEFAULT_BASE,
    pruneSource: '',
    dryRun: false
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dir') args.dir = path.resolve(argv[++i] || '')
    else if (a === '--snapshot') args.snapshot = path.resolve(argv[++i] || '')
    else if (a === '--db') args.dbPath = path.resolve(argv[++i] || '')
    else if (a === '--base-url') args.baseUrl = String(argv[++i] || DEFAULT_BASE).replace(/\/$/, '')
    else if (a === '--prune-source') args.pruneSource = String(argv[++i] || '').trim()
    else if (a === '--dry-run') args.dryRun = true
  }

  if (!args.snapshot) {
    args.snapshot = args.dir
      ? path.join(args.dir, 'snapshot.json')
      : path.join(HERE, 'out', 'recipes', 'snapshot.json')
  }

  return args
}

function normalizeImageUrl(imageUrl, baseUrl) {
  if (!imageUrl) return null
  const value = String(imageUrl).trim()
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith('/')) return `${baseUrl}${value}`
  return value
}

function upsertIngredient(db, row) {
  db.prepare(`
    INSERT INTO ingredients (
      id, name, spoonacular_ingredient_id, spoonacular_data, created_at, updated_at
    ) VALUES (
      @id, @name, @spoonacularIngredientId, @spoonacularData, @createdAt, @updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      spoonacular_ingredient_id = excluded.spoonacular_ingredient_id,
      spoonacular_data = excluded.spoonacular_data,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `).run({
    id: row.id,
    name: row.name,
    spoonacularIngredientId: row.spoonacularIngredientId ?? null,
    spoonacularData: row.spoonacularData ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  })
}

function upsertRecipe(db, row, baseUrl) {
  db.prepare(`
    INSERT INTO recipes (
      id, title, description, image_url, date, tags, source, steps, visibility, author_id, created_at, updated_at
    ) VALUES (
      @id, @title, @description, @imageUrl, @date, @tags, @source, @steps, @visibility, @authorId, @createdAt, @updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      image_url = excluded.image_url,
      date = excluded.date,
      tags = excluded.tags,
      source = excluded.source,
      steps = excluded.steps,
      visibility = excluded.visibility,
      author_id = excluded.author_id,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `).run({
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    imageUrl: normalizeImageUrl(row.imageUrl, baseUrl),
    date: row.date,
    tags: typeof row.tags === 'string' ? row.tags : JSON.stringify(row.tags ?? []),
    source: row.source ?? null,
    steps: typeof row.steps === 'string' ? row.steps : JSON.stringify(row.steps ?? []),
    visibility: row.visibility ?? 'public',
    authorId: null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  })
}

function upsertRecipeIngredient(db, row) {
  db.prepare(`
    INSERT INTO recipe_ingredients (
      id, recipe_id, ingredient_id, amount, unit, notes, "order", created_at, updated_at
    ) VALUES (
      @id, @recipeId, @ingredientId, @amount, @unit, @notes, @order, @createdAt, @updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      recipe_id = excluded.recipe_id,
      ingredient_id = excluded.ingredient_id,
      amount = excluded.amount,
      unit = excluded.unit,
      notes = excluded.notes,
      "order" = excluded."order",
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `).run({
    id: row.id,
    recipeId: row.recipeId,
    ingredientId: row.ingredientId,
    amount: row.amount,
    unit: row.unit,
    notes: row.notes ?? null,
    order: row.order ?? '0',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  })
}

function pruneSource(db, source) {
  const recipeIds = db.prepare(
    'SELECT id FROM recipes WHERE source = ?'
  ).all(source).map((row) => row.id)

  if (recipeIds.length === 0) return 0

  const deleteRecipeIngredients = db.prepare(
    'DELETE FROM recipe_ingredients WHERE recipe_id = ?'
  )
  const deleteRecipe = db.prepare(
    'DELETE FROM recipes WHERE id = ?'
  )

  for (const recipeId of recipeIds) {
    deleteRecipeIngredients.run(recipeId)
    deleteRecipe.run(recipeId)
  }

  return recipeIds.length
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!existsSync(args.snapshot)) {
    throw new Error(`Snapshot not found: ${args.snapshot}`)
  }

  if (!existsSync(args.dbPath)) {
    throw new Error(
      `Local database not found at ${args.dbPath}. Start \`bun run dev\` once so migrations create it, then stop the dev server before loading.`
    )
  }

  const snapshot = JSON.parse(await readFile(args.snapshot, 'utf8'))
  const baseUrl = args.baseUrl || snapshot?.meta?.baseUrl || DEFAULT_BASE
  const recipes = snapshot.recipes || []
  const ingredients = snapshot.ingredients || []
  const recipeIngredients = snapshot.recipeIngredients || []

  console.log(
    `Loading snapshot with ${recipes.length} recipe(s), ${recipeIngredients.length} recipe ingredient(s), ${ingredients.length} ingredient(s).`
  )

  if (args.dryRun) {
    console.log('Dry run — no database changes made.')
    return
  }

  const db = new Database(args.dbPath)
  db.pragma('foreign_keys = ON')

  const loadAll = db.transaction(() => {
    if (args.pruneSource) {
      const removed = pruneSource(db, args.pruneSource)
      console.log(`Pruned ${removed} local recipe(s) for source ${JSON.stringify(args.pruneSource)}`)
    }

    for (const row of ingredients) upsertIngredient(db, row)
    for (const row of recipes) upsertRecipe(db, row, baseUrl)
    for (const row of recipeIngredients) upsertRecipeIngredient(db, row)
  })

  loadAll()
  db.close()

  console.log(`Upserted into ${args.dbPath}`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
