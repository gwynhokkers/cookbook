/**
 * Unit conversion utility for common cooking units
 */

export type UnitType = 'volume' | 'weight' | 'count'

export interface UnitConversion {
  from: string
  to: string
  factor: number
  type: UnitType
}

// Volume conversions (ml as base)
const VOLUME_CONVERSIONS: Record<string, number> = {
  ml: 1,
  l: 1000,
  'tsp': 4.92892,
  'tbsp': 14.7868,
  'cup': 236.588,
  'cups': 236.588,
  'fl oz': 29.5735,
  'pint': 473.176,
  'quart': 946.353,
  'gallon': 3785.41
}

// Weight conversions (grams as base)
const WEIGHT_CONVERSIONS: Record<string, number> = {
  g: 1,
  'gram': 1,
  'grams': 1,
  kg: 1000,
  'kilogram': 1000,
  'kilograms': 1000,
  oz: 28.3495,
  'ounce': 28.3495,
  'ounces': 28.3495,
  lb: 453.592,
  'pound': 453.592,
  'pounds': 453.592
}

/**
 * Normalize unit name to standard form
 */
export function normalizeUnit(unit: string): string {
  const normalized = unit.toLowerCase().trim()
  
  // Volume units
  if (normalized === 'teaspoon' || normalized === 'teaspoons') return 'tsp'
  if (normalized === 'tablespoon' || normalized === 'tablespoons') return 'tbsp'
  if (normalized === 'cup') return 'cups'
  if (normalized === 'liter' || normalized === 'liters') return 'l'
  if (normalized === 'milliliter' || normalized === 'milliliters') return 'ml'
  
  // Weight units
  if (normalized === 'gram' || normalized === 'grams') return 'grams'
  if (normalized === 'kilogram' || normalized === 'kilograms') return 'kg'
  if (normalized === 'ounce' || normalized === 'ounces') return 'oz'
  if (normalized === 'pound' || normalized === 'pounds') return 'lb'
  
  // Count units
  if (normalized === 'piece' || normalized === 'pc' || normalized === 'pcs') return 'pieces'
  
  return normalized
}

/**
 * Get unit type (volume, weight, or count)
 */
export function getUnitType(unit: string): UnitType {
  const normalized = normalizeUnit(unit)
  
  if (VOLUME_CONVERSIONS[normalized]) return 'volume'
  if (WEIGHT_CONVERSIONS[normalized]) return 'weight'
  return 'count'
}

/**
 * Convert amount from one unit to another
 * Returns null if conversion is not possible (different types or unknown units)
 */
export function convertUnit(amount: number, fromUnit: string, toUnit: string): number | null {
  const from = normalizeUnit(fromUnit)
  const to = normalizeUnit(toUnit)
  
  // Same unit, no conversion needed
  if (from === to) return amount
  
  const fromType = getUnitType(from)
  const toType = getUnitType(to)
  
  // Can't convert between different types
  if (fromType !== toType) return null
  
  // Count units can't be converted
  if (fromType === 'count') return null
  
  let baseAmount: number
  
  if (fromType === 'volume') {
    const fromFactor = VOLUME_CONVERSIONS[from]
    const toFactor = VOLUME_CONVERSIONS[to]
    if (!fromFactor || !toFactor) return null
    baseAmount = amount * fromFactor // Convert to ml
    return baseAmount / toFactor // Convert from ml to target unit
  }
  
  if (fromType === 'weight') {
    const fromFactor = WEIGHT_CONVERSIONS[from]
    const toFactor = WEIGHT_CONVERSIONS[to]
    if (!fromFactor || !toFactor) return null
    baseAmount = amount * fromFactor // Convert to grams
    return baseAmount / toFactor // Convert from grams to target unit
  }
  
  return null
}

/**
 * Try to convert and sum amounts with different units
 * Returns the total in the target unit, or null if conversion fails
 */
export function sumWithConversion(
  amounts: Array<{ amount: number; unit: string }>,
  targetUnit: string
): number | null {
  const target = normalizeUnit(targetUnit)
  let total = 0
  
  for (const item of amounts) {
    const converted = convertUnit(item.amount, item.unit, target)
    if (converted === null) return null
    total += converted
  }
  
  return total
}

/**
 * Get all available units of a given type
 */
export function getUnitsByType(type: UnitType): string[] {
  if (type === 'volume') {
    return Object.keys(VOLUME_CONVERSIONS)
  }
  if (type === 'weight') {
    return Object.keys(WEIGHT_CONVERSIONS)
  }
  return ['pieces', 'piece', 'pc', 'pcs']
}
