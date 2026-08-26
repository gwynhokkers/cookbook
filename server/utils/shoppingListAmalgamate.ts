import type { H3Event } from 'h3'
import { eq, inArray } from 'drizzle-orm'
import { db, schema } from '../db'
import { viewRecipe } from '~~/shared/utils/abilities'
import { formatIngredientLine } from '~~/shared/utils/formatIngredient'
import type {
  AmalgamatedIngredient,
  ShoppingListContribution
} from '~~/shared/utils/shoppingListTypes'
import { assertUserOwnsShoppingList } from './shoppingAuth'
import { convertUnit, getUnitType, normalizeUnit } from './unitConverter'

type RawContribution = ShoppingListContribution & {
  ingredientId: string
  ingredientName: string
}

function parseNumericAmount(amount: string): number | null {
  const value = Number(String(amount).trim())
  return Number.isFinite(value) ? value : null
}

function formatNumeric(amount: number): string {
  return String(Math.round(amount * 1000) / 1000)
}

function pickPreferredUnit(units: string[]): string {
  if (!units.length) {
    return ''
  }

  const counts = new Map<string, number>()
  for (const unit of units) {
    const key = normalizeUnit(unit)
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  let best = units[0]!
  let bestCount = 0
  for (const [unit, count] of counts) {
    if (count > bestCount) {
      best = unit
      bestCount = count
    }
  }

  const type = getUnitType(best)
  if (type === 'volume') {
    return normalizeUnit(best)
  }
  if (type === 'weight') {
    return normalizeUnit(best)
  }
  return normalizeUnit(best)
}

function mergeGroup(rows: RawContribution[]): AmalgamatedIngredient {
  const name = rows[0]?.ingredientName || 'Unknown'
  const ingredientId = rows[0]?.ingredientId || null
  const contributions: ShoppingListContribution[] = rows.map(row => ({
    recipeId: row.recipeId,
    title: row.title,
    amount: row.amount,
    unit: row.unit,
    notes: row.notes
  }))

  const numericRows = rows
    .map(row => ({
      ...row,
      numeric: parseNumericAmount(row.amount),
      unitType: getUnitType(row.unit)
    }))
    .filter(row => row.numeric !== null) as Array<RawContribution & {
    numeric: number
    unitType: ReturnType<typeof getUnitType>
  }>

  const nonNumeric = rows.filter(row => parseNumericAmount(row.amount) === null)

  if (!numericRows.length) {
    const displayParts = contributions.map(c =>
      formatIngredientLine({
        amount: c.amount,
        unit: c.unit,
        name: '',
        notes: c.notes
      })
    )
    return {
      ingredientId,
      name,
      totalAmount: '',
      totalUnit: '',
      displayAmount: displayParts.filter(Boolean).join(' + ') || name,
      needsReview: true,
      contributions
    }
  }

  const volumeRows = numericRows.filter(row => row.unitType === 'volume')
  const weightRows = numericRows.filter(row => row.unitType === 'weight')
  const countRows = numericRows.filter(row => row.unitType === 'count')

  const typeBuckets = [volumeRows, weightRows, countRows].filter(bucket => bucket.length > 0)
  const needsReview = typeBuckets.length > 1 || nonNumeric.length > 0

  // Prefer the largest convertible bucket for the primary total.
  const primaryBucket = typeBuckets.sort((a, b) => b.length - a.length)[0]!
  const preferredUnit = pickPreferredUnit(primaryBucket.map(row => row.unit))

  let total = 0
  let convertible = true
  for (const row of primaryBucket) {
    if (row.unitType === 'count') {
      if (normalizeUnit(row.unit) !== preferredUnit && normalizeUnit(preferredUnit) !== 'pieces') {
        // Count units with mismatched labels still sum as counts when both are count-type.
        total += row.numeric
        continue
      }
      total += row.numeric
      continue
    }

    const converted = convertUnit(row.numeric, row.unit, preferredUnit)
    if (converted === null) {
      convertible = false
      break
    }
    total += converted
  }

  if (!convertible && primaryBucket[0]) {
    // Fall back to summing in the first row's unit where possible.
    const fallbackUnit = normalizeUnit(primaryBucket[0].unit)
    total = 0
    convertible = true
    for (const row of primaryBucket) {
      const converted = convertUnit(row.numeric, row.unit, fallbackUnit)
      if (converted === null) {
        convertible = false
        break
      }
      total += converted
    }

    if (convertible) {
      const displayAmount = formatIngredientLine({
        amount: formatNumeric(total),
        unit: fallbackUnit,
        name: ''
      })
      return {
        ingredientId,
        name,
        totalAmount: formatNumeric(total),
        totalUnit: fallbackUnit,
        displayAmount: displayAmount || `${formatNumeric(total)} ${fallbackUnit}`,
        needsReview,
        contributions
      }
    }
  }

  if (convertible) {
    const displayAmount = formatIngredientLine({
      amount: formatNumeric(total),
      unit: preferredUnit,
      name: ''
    })
    return {
      ingredientId,
      name,
      totalAmount: formatNumeric(total),
      totalUnit: preferredUnit,
      displayAmount: displayAmount || `${formatNumeric(total)} ${preferredUnit}`,
      needsReview,
      contributions
    }
  }

  // Could not merge numerically — keep exact contribution display.
  const displayParts = contributions.map(c =>
    formatIngredientLine({
      amount: c.amount,
      unit: c.unit,
      name: '',
      notes: c.notes
    })
  )

  return {
    ingredientId,
    name,
    totalAmount: '',
    totalUnit: '',
    displayAmount: displayParts.filter(Boolean).join(' + '),
    needsReview: true,
    contributions
  }
}

export async function amalgamateRecipeIngredients(
  event: H3Event,
  recipeIds: string[]
): Promise<AmalgamatedIngredient[]> {
  const uniqueIds = [...new Set(recipeIds.filter(Boolean))]
  if (!uniqueIds.length) {
    return []
  }

  const recipes = await db.select({
    id: schema.recipes.id,
    title: schema.recipes.title,
    visibility: schema.recipes.visibility
  })
    .from(schema.recipes)
    .where(inArray(schema.recipes.id, uniqueIds))

  const allowed: Array<{ id: string, title: string }> = []
  for (const recipe of recipes) {
    await authorize(event, viewRecipe, recipe)
    allowed.push({ id: recipe.id, title: recipe.title })
  }

  if (!allowed.length) {
    return []
  }

  const allowedIds = allowed.map(r => r.id)
  const titleById = new Map(allowed.map(r => [r.id, r.title]))

  const rows = await db.select({
    recipeId: schema.recipeIngredients.recipeId,
    ingredientId: schema.recipeIngredients.ingredientId,
    amount: schema.recipeIngredients.amount,
    unit: schema.recipeIngredients.unit,
    notes: schema.recipeIngredients.notes,
    ingredientName: schema.ingredients.name
  })
    .from(schema.recipeIngredients)
    .innerJoin(
      schema.ingredients,
      eq(schema.recipeIngredients.ingredientId, schema.ingredients.id)
    )
    .where(inArray(schema.recipeIngredients.recipeId, allowedIds))

  const groups = new Map<string, RawContribution[]>()

  for (const row of rows) {
    const key = row.ingredientId
    const list = groups.get(key) || []
    list.push({
      recipeId: row.recipeId,
      title: titleById.get(row.recipeId) || 'Recipe',
      amount: row.amount,
      unit: row.unit,
      notes: row.notes,
      ingredientId: row.ingredientId,
      ingredientName: row.ingredientName
    })
    groups.set(key, list)
  }

  return [...groups.values()]
    .map(mergeGroup)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function getShoppingListRecipeIds(listId: string): Promise<string[]> {
  const rows = await db.select({
    recipeId: schema.shoppingListRecipes.recipeId
  })
    .from(schema.shoppingListRecipes)
    .where(eq(schema.shoppingListRecipes.listId, listId))

  return rows.map(row => row.recipeId)
}

export async function assertShoppingListOwned(listId: string, userId: string) {
  const rows = await db.select()
    .from(schema.shoppingLists)
    .where(eq(schema.shoppingLists.id, listId))
    .limit(1)

  return assertUserOwnsShoppingList(rows[0], userId)
}
