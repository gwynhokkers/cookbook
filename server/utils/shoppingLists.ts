import type { H3Event } from 'h3'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db, schema } from '../db'
import { viewRecipe } from '~~/shared/utils/abilities'
import type {
  ShoppingListDto,
  ShoppingListItemDto,
  ShoppingListStatus,
  ShoppingListSummaryDto
} from '~~/shared/utils/shoppingListTypes'
import {
  amalgamateRecipeIngredients,
  assertShoppingListOwned,
  getShoppingListRecipeIds
} from './shoppingListAmalgamate'
import { enrichShoppingListItems } from './shoppingListEnrich'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const generateLocks = new Map<string, Promise<ShoppingListDto>>()

export function isValidListDate(date: string): boolean {
  if (!DATE_RE.test(date)) {
    return false
  }
  const parsed = new Date(`${date}T00:00:00`)
  return !Number.isNaN(parsed.getTime())
}

function toIso(value: Date | number | null | undefined): string | null {
  if (value == null) {
    return null
  }
  const date = value instanceof Date ? value : new Date(value)
  return date.toISOString()
}

function mapItem(row: typeof schema.shoppingListItems.$inferSelect): ShoppingListItemDto {
  return {
    id: row.id,
    listId: row.listId,
    ingredientId: row.ingredientId,
    name: row.name,
    totalAmount: row.totalAmount,
    totalUnit: row.totalUnit,
    displayAmount: row.displayAmount,
    aisle: row.aisle,
    packageSuggestion: row.packageSuggestion,
    substitutionNote: row.substitutionNote,
    needsReview: Boolean(row.needsReview),
    checked: Boolean(row.checked),
    contributions: row.contributions || [],
    sortOrder: row.sortOrder
  }
}

export async function loadShoppingListDto(listId: string): Promise<ShoppingListDto> {
  const lists = await db.select()
    .from(schema.shoppingLists)
    .where(eq(schema.shoppingLists.id, listId))
    .limit(1)

  const list = lists[0]
  if (!list) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Shopping list not found'
    })
  }

  const recipeLinks = await db.select({
    recipeId: schema.shoppingListRecipes.recipeId
  })
    .from(schema.shoppingListRecipes)
    .where(eq(schema.shoppingListRecipes.listId, listId))

  const recipeIds = recipeLinks.map(link => link.recipeId)
  const recipes = recipeIds.length
    ? await db.select({
      id: schema.recipes.id,
      title: schema.recipes.title,
      description: schema.recipes.description,
      imageUrl: schema.recipes.imageUrl
    })
      .from(schema.recipes)
      .where(inArray(schema.recipes.id, recipeIds))
    : []

  const order = new Map(recipeIds.map((id, index) => [id, index]))
  recipes.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))

  const items = await db.select()
    .from(schema.shoppingListItems)
    .where(eq(schema.shoppingListItems.listId, listId))
    .orderBy(asc(schema.shoppingListItems.sortOrder), asc(schema.shoppingListItems.name))

  return {
    id: list.id,
    userId: list.userId,
    listDate: list.listDate,
    title: list.title,
    status: list.status as ShoppingListStatus,
    generatedAt: toIso(list.generatedAt),
    createdAt: toIso(list.createdAt) || new Date().toISOString(),
    updatedAt: toIso(list.updatedAt) || new Date().toISOString(),
    recipes,
    items: items.map(mapItem)
  }
}

export async function getOrCreateShoppingList(
  userId: string,
  listDate: string
): Promise<ShoppingListDto> {
  if (!isValidListDate(listDate)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid list date. Use YYYY-MM-DD.'
    })
  }

  const existing = await db.select()
    .from(schema.shoppingLists)
    .where(and(
      eq(schema.shoppingLists.userId, userId),
      eq(schema.shoppingLists.listDate, listDate)
    ))
    .limit(1)

  if (existing[0]) {
    return loadShoppingListDto(existing[0].id)
  }

  const id = nanoid()
  const now = new Date()
  await db.insert(schema.shoppingLists).values({
    id,
    userId,
    listDate,
    title: `Shopping list ${listDate}`,
    status: 'draft',
    createdAt: now,
    updatedAt: now
  })

  return loadShoppingListDto(id)
}

export async function listShoppingLists(
  userId: string,
  limit = 30
): Promise<ShoppingListSummaryDto[]> {
  const capped = Math.min(Math.max(limit, 1), 100)

  const rows = await db.select({
    id: schema.shoppingLists.id,
    listDate: schema.shoppingLists.listDate,
    title: schema.shoppingLists.title,
    status: schema.shoppingLists.status,
    updatedAt: schema.shoppingLists.updatedAt,
    recipeCount: sql<number>`(
      SELECT COUNT(*) FROM shopping_list_recipes
      WHERE shopping_list_recipes.list_id = ${schema.shoppingLists.id}
    )`,
    itemCount: sql<number>`(
      SELECT COUNT(*) FROM shopping_list_items
      WHERE shopping_list_items.list_id = ${schema.shoppingLists.id}
    )`
  })
    .from(schema.shoppingLists)
    .where(eq(schema.shoppingLists.userId, userId))
    .orderBy(desc(schema.shoppingLists.listDate))
    .limit(capped)

  return rows.map(row => ({
    id: row.id,
    listDate: row.listDate,
    title: row.title,
    status: row.status as ShoppingListStatus,
    recipeCount: Number(row.recipeCount) || 0,
    itemCount: Number(row.itemCount) || 0,
    updatedAt: toIso(row.updatedAt) || new Date().toISOString()
  }))
}

export async function setShoppingListRecipes(
  event: H3Event,
  listId: string,
  userId: string,
  recipeIds: string[],
  mode: 'replace' | 'add' = 'replace'
): Promise<ShoppingListDto> {
  await assertShoppingListOwned(listId, userId)

  const uniqueIds = [...new Set(recipeIds.filter(Boolean))]

  if (uniqueIds.length) {
    const recipes = await db.select({
      id: schema.recipes.id,
      visibility: schema.recipes.visibility
    })
      .from(schema.recipes)
      .where(inArray(schema.recipes.id, uniqueIds))

    if (recipes.length !== uniqueIds.length) {
      throw createError({
        statusCode: 400,
        statusMessage: 'One or more recipes were not found'
      })
    }

    for (const recipe of recipes) {
      await authorize(event, viewRecipe, recipe)
    }
  }

  if (mode === 'replace') {
    await db.delete(schema.shoppingListRecipes)
      .where(eq(schema.shoppingListRecipes.listId, listId))
  }

  if (uniqueIds.length) {
    const existing = mode === 'add'
      ? await getShoppingListRecipeIds(listId)
      : []
    const existingSet = new Set(existing)
    const toInsert = uniqueIds.filter(id => !existingSet.has(id))

    if (toInsert.length) {
      await db.insert(schema.shoppingListRecipes).values(
        toInsert.map(recipeId => ({
          listId,
          recipeId,
          createdAt: new Date()
        }))
      )
    }
  }

  await db.update(schema.shoppingLists)
    .set({
      updatedAt: new Date(),
      status: 'draft',
      generatedAt: null
    })
    .where(eq(schema.shoppingLists.id, listId))

  // Clear stale generated items when recipes change.
  await db.delete(schema.shoppingListItems)
    .where(eq(schema.shoppingListItems.listId, listId))

  return loadShoppingListDto(listId)
}

export async function removeShoppingListRecipe(
  listId: string,
  userId: string,
  recipeId: string
): Promise<ShoppingListDto> {
  await assertShoppingListOwned(listId, userId)

  await db.delete(schema.shoppingListRecipes)
    .where(and(
      eq(schema.shoppingListRecipes.listId, listId),
      eq(schema.shoppingListRecipes.recipeId, recipeId)
    ))

  await db.update(schema.shoppingLists)
    .set({
      updatedAt: new Date(),
      status: 'draft',
      generatedAt: null
    })
    .where(eq(schema.shoppingLists.id, listId))

  await db.delete(schema.shoppingListItems)
    .where(eq(schema.shoppingListItems.listId, listId))

  return loadShoppingListDto(listId)
}

export async function deleteShoppingList(listId: string, userId: string) {
  await assertShoppingListOwned(listId, userId)
  await db.delete(schema.shoppingLists)
    .where(eq(schema.shoppingLists.id, listId))
  return { deleted: true }
}

export async function setShoppingListItemChecked(
  listId: string,
  itemId: string,
  userId: string,
  checked: boolean
): Promise<ShoppingListItemDto> {
  await assertShoppingListOwned(listId, userId)

  const updated = await db.update(schema.shoppingListItems)
    .set({
      checked,
      updatedAt: new Date()
    })
    .where(and(
      eq(schema.shoppingListItems.id, itemId),
      eq(schema.shoppingListItems.listId, listId)
    ))

  const rows = await db.select()
    .from(schema.shoppingListItems)
    .where(and(
      eq(schema.shoppingListItems.id, itemId),
      eq(schema.shoppingListItems.listId, listId)
    ))
    .limit(1)

  if (!rows.length) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Shopping list item not found'
    })
  }

  return mapItem(rows[0]!)
}

async function persistAmalgamatedItems(
  listId: string,
  enriched: Awaited<ReturnType<typeof enrichShoppingListItems>>['items'],
  previousChecked: Map<string, boolean>
) {
  await db.delete(schema.shoppingListItems)
    .where(eq(schema.shoppingListItems.listId, listId))

  if (!enriched.length) {
    return
  }

  await db.insert(schema.shoppingListItems).values(
    enriched.map((item, index) => ({
      id: nanoid(),
      listId,
      ingredientId: item.ingredientId,
      name: item.name,
      totalAmount: item.totalAmount,
      totalUnit: item.totalUnit,
      displayAmount: item.displayAmount,
      aisle: item.aisle,
      packageSuggestion: item.packageSuggestion,
      substitutionNote: item.substitutionNote,
      needsReview: item.needsReview,
      checked: previousChecked.get(item.ingredientId || item.name) || false,
      contributions: item.contributions,
      sortOrder: index,
      createdAt: new Date(),
      updatedAt: new Date()
    }))
  )
}

async function runGenerate(
  event: H3Event,
  listId: string,
  userId: string
): Promise<ShoppingListDto> {
  await assertShoppingListOwned(listId, userId)
  const recipeIds = await getShoppingListRecipeIds(listId)

  if (!recipeIds.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Add at least one recipe before generating a shopping list'
    })
  }

  const previousItems = await db.select({
    ingredientId: schema.shoppingListItems.ingredientId,
    name: schema.shoppingListItems.name,
    checked: schema.shoppingListItems.checked
  })
    .from(schema.shoppingListItems)
    .where(eq(schema.shoppingListItems.listId, listId))

  const previousChecked = new Map<string, boolean>()
  for (const item of previousItems) {
    previousChecked.set(item.ingredientId || item.name, Boolean(item.checked))
  }

  const amalgamated = await amalgamateRecipeIngredients(event, recipeIds)
  const { items, warning, enriched } = await enrichShoppingListItems(event, amalgamated)

  await persistAmalgamatedItems(listId, items, previousChecked)

  const now = new Date()
  await db.update(schema.shoppingLists)
    .set({
      status: enriched ? 'generated' : 'draft',
      generatedAt: enriched ? now : null,
      updatedAt: now
    })
    .where(eq(schema.shoppingLists.id, listId))

  const dto = await loadShoppingListDto(listId)
  return {
    ...dto,
    warning: warning || null
  }
}

export async function generateShoppingList(
  event: H3Event,
  listId: string,
  userId: string
): Promise<ShoppingListDto> {
  const existing = generateLocks.get(listId)
  if (existing) {
    return existing
  }

  const promise = runGenerate(event, listId, userId)
    .finally(() => {
      generateLocks.delete(listId)
    })

  generateLocks.set(listId, promise)
  return promise
}

export function formatShoppingListCopyText(list: ShoppingListDto): string {
  const lines: string[] = [
    list.title || `Shopping list ${list.listDate}`,
    `Date: ${list.listDate}`,
    ''
  ]

  if (list.recipes.length) {
    lines.push(`Recipes: ${list.recipes.map(r => r.title).join(', ')}`, '')
  }

  const byAisle = new Map<string, ShoppingListItemDto[]>()
  for (const item of list.items) {
    const aisle = item.aisle || 'Other'
    const bucket = byAisle.get(aisle) || []
    bucket.push(item)
    byAisle.set(aisle, bucket)
  }

  const aisleOrder = [
    'Produce',
    'Bakery',
    'Dairy',
    'Meat & Seafood',
    'Pantry',
    'Frozen',
    'Spices',
    'Beverages',
    'Other'
  ]

  const aisles = [
    ...aisleOrder.filter(name => byAisle.has(name)),
    ...[...byAisle.keys()].filter(name => !aisleOrder.includes(name)).sort()
  ]

  for (const aisle of aisles) {
    lines.push(`## ${aisle}`)
    for (const item of byAisle.get(aisle) || []) {
      const check = item.checked ? '[x]' : '[ ]'
      let line = `${check} ${item.displayAmount} ${item.name}`.replace(/\s+/g, ' ').trim()
      if (item.packageSuggestion) {
        line += ` — ${item.packageSuggestion}`
      }
      if (item.substitutionNote) {
        line += ` (note: ${item.substitutionNote})`
      }
      if (item.needsReview) {
        line += ' [review amounts]'
      }
      lines.push(line)
    }
    lines.push('')
  }

  return lines.join('\n').trim() + '\n'
}
