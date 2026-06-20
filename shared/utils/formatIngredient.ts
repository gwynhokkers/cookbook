/**
 * Shared ingredient formatting + normalization helpers.
 *
 * Used on both the client (RecipeForm preview, recipe view, shopping list) and the
 * server, so it must stay framework-free.
 *
 * Core idea: "count" units (pieces / whole items / cloves / an empty unit) should never
 * render a unit word — "1 lemon", not "1 pieces lemon". Measured units (g, ml, tbsp…)
 * always render the unit — "2 tbsp olive oil".
 */

/**
 * Internal sentinel used for count-style ingredients. Spoonacular's parser returns an
 * empty string for the unit of things like "1 lemon"; we store this sentinel instead so
 * that the recipe_ingredient.unit column (NOT NULL) and the submit filters that require a
 * truthy unit keep working.
 */
export const COUNT_UNIT = 'item'

const COUNT_UNITS = new Set([
  '',
  'item',
  'items',
  'piece',
  'pieces',
  'pc',
  'pcs',
  'whole',
  'each',
  'clove',
  'cloves',
  'slice',
  'slices'
])

/**
 * True when the unit represents a count of whole items rather than a measure, e.g.
 * "pieces", "whole", "clove", or an empty/blank unit.
 */
export function isCountUnit(unit: string | null | undefined): boolean {
  return COUNT_UNITS.has(String(unit ?? '').trim().toLowerCase())
}

export interface IngredientLineParts {
  amount?: string | number | null
  unit?: string | null
  name?: string | null
  ingredientName?: string | null
  notes?: string | null
}

const parseAmount = (amount: string | number | null | undefined): number | null => {
  if (amount === null || amount === undefined || amount === '') return null
  const value = typeof amount === 'number' ? amount : Number(String(amount).trim())
  return Number.isFinite(value) ? value : null
}

const formatAmount = (amount: string | number | null | undefined): string => {
  const value = parseAmount(amount)
  if (value === null) {
    // Keep non-numeric amounts (e.g. "a pinch", fractions) as-is.
    return String(amount ?? '').trim()
  }
  // Drop trailing zeros: 2 -> "2", 1.5 -> "1.5", 0.25 -> "0.25".
  return String(Math.round(value * 1000) / 1000)
}

/**
 * Very small English pluralizer for count-unit ingredient names when amount > 1.
 * Intentionally conservative — only handles the most common regular cases.
 */
const pluralizeName = (name: string): string => {
  const trimmed = name.trim()
  if (!trimmed) return trimmed

  // Only pluralize the final word so "clove of garlic" -> "cloves of garlic" is avoided
  // (we just pluralize the head noun for simple names like "lemon" -> "lemons").
  const words = trimmed.split(' ')
  const last = words[words.length - 1]
  if (!last) return trimmed

  // Skip if it already looks plural.
  if (/(s|es)$/i.test(last)) return trimmed

  let plural: string
  if (/(s|x|z|ch|sh)$/i.test(last)) {
    plural = `${last}es`
  } else if (/[^aeiou]y$/i.test(last)) {
    plural = `${last.slice(0, -1)}ies`
  } else {
    plural = `${last}s`
  }

  words[words.length - 1] = plural
  return words.join(' ')
}

/**
 * Render a single ingredient line for display.
 *
 * - Count units hide the unit word: "1 lemon", "2 lemons" (simple pluralization).
 * - Measured units keep the unit: "2 tbsp olive oil".
 * - Notes are appended in parentheses: "1 lemon (juiced)".
 */
export function formatIngredientLine(parts: IngredientLineParts): string {
  const name = String(parts.name ?? parts.ingredientName ?? '').trim()
  const unit = String(parts.unit ?? '').trim()
  const notes = String(parts.notes ?? '').trim()
  const amountText = formatAmount(parts.amount)
  const amountValue = parseAmount(parts.amount)

  const segments: string[] = []

  if (isCountUnit(unit)) {
    if (amountText) segments.push(amountText)
    if (name) {
      segments.push(amountValue !== null && amountValue > 1 ? pluralizeName(name) : name)
    }
  } else {
    if (amountText) segments.push(amountText)
    if (unit) segments.push(unit)
    if (name) segments.push(name)
  }

  let line = segments.join(' ').trim()
  if (notes) {
    line = line ? `${line} (${notes})` : `(${notes})`
  }
  return line
}

export interface ParsedSpoonacularIngredient {
  id?: number
  name?: string
  originalName?: string
  original?: string
  amount?: number
  unit?: string
  unitShort?: string
  meta?: string[]
  nutrition?: unknown
  [key: string]: unknown
}

export interface NormalizedIngredient {
  amount: string
  unit: string
  ingredientName: string
  notes: string
  spoonacularIngredientId?: number
  spoonacularData?: Record<string, unknown>
}

/**
 * Map a Spoonacular parse result to our internal ingredient shape.
 *
 * - Empty/blank unit becomes the COUNT_UNIT sentinel.
 * - meta (e.g. ["juiced", "chopped"]) becomes the notes field.
 * - The full parse object (including absolute nutrition for the parsed amount) is kept as
 *   spoonacularData, tagged with `nutritionBasis` so the nutrition calculator can scale it
 *   linearly instead of treating it as per-100g data.
 */
export function normalizeParsedIngredient(parsed: ParsedSpoonacularIngredient): NormalizedIngredient {
  const rawUnit = String(parsed.unitShort || parsed.unit || '').trim()
  const unit = rawUnit ? rawUnit : COUNT_UNIT
  const ingredientName = String(parsed.name || parsed.originalName || '').trim()
  const amount = parsed.amount !== undefined && parsed.amount !== null ? String(parsed.amount) : ''
  const notes = Array.isArray(parsed.meta) ? parsed.meta.filter(Boolean).join(', ') : ''

  const hasSpoonacularId = typeof parsed.id === 'number' && parsed.id > 0

  let spoonacularData: Record<string, unknown> | undefined
  if (hasSpoonacularId) {
    spoonacularData = {
      ...parsed,
      // Marks this data as absolute nutrition for the given amount/unit (from parse),
      // as opposed to per-100g data from the ingredient info endpoint.
      nutritionBasis: {
        amount: parsed.amount ?? null,
        unit
      }
    }
  }

  return {
    amount,
    unit,
    ingredientName,
    notes,
    spoonacularIngredientId: hasSpoonacularId ? parsed.id : undefined,
    spoonacularData
  }
}
