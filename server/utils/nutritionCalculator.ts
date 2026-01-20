import { convertUnit, getUnitType, normalizeUnit } from './unitConverter'

interface SpoonacularNutrition {
  nutrients: Array<{
    name: string
    amount: number
    unit: string
    percentOfDailyNeeds?: number
  }>
}

interface SpoonacularIngredientData {
  id: number
  name: string
  nutrition?: SpoonacularNutrition
  [key: string]: any
}

export interface NutritionData {
  energyKcal: number
  proteins: number
  carbohydrates: number
  fat: number
  fiber: number
  sugars: number
  salt: number
  sodium: number
  [key: string]: number
}

export interface RecipeIngredientNutrition {
  ingredientId: string
  ingredientName: string
  amount: number
  unit: string
  nutrition: NutritionData
}

export interface RecipeNutrition {
  total: NutritionData
  perServing: NutritionData
  servings: number
  ingredients: RecipeIngredientNutrition[]
}

/**
 * Extract nutrition data from Spoonacular ingredient data
 * Returns nutrition per 100g
 */
export function extractNutrition(ingredientData: SpoonacularIngredientData | null): NutritionData | null {
  if (!ingredientData?.nutrition?.nutrients) return null
  
  const nutrients = ingredientData.nutrition.nutrients
  const nutrientMap = new Map<string, number>()
  
  // Create a map for easy lookup
  for (const nutrient of nutrients) {
    nutrientMap.set(nutrient.name.toLowerCase(), nutrient.amount)
  }
  
  return {
    energyKcal: nutrientMap.get('calories') || nutrientMap.get('energy') || 0,
    proteins: nutrientMap.get('protein') || 0,
    carbohydrates: nutrientMap.get('carbohydrates') || 0,
    fat: nutrientMap.get('fat') || 0,
    fiber: nutrientMap.get('fiber') || 0,
    sugars: nutrientMap.get('sugar') || nutrientMap.get('sugars') || 0, // Spoonacular uses "Sugar" (singular)
    salt: nutrientMap.get('sodium') ? (nutrientMap.get('sodium')! / 1000) * 2.54 : 0, // Convert sodium (mg) to salt (g)
    sodium: nutrientMap.get('sodium') ? nutrientMap.get('sodium')! / 1000 : 0 // Convert mg to g
  }
}

/**
 * Convert nutrition from per 100g to per unit (cup, tbsp, etc.)
 * This is a simplified conversion - in reality, density varies by ingredient
 */
export function convertNutritionToUnit(
  nutritionPer100g: NutritionData,
  amount: number,
  unit: string
): NutritionData {
  const unitType = getUnitType(unit)
  const normalizedUnit = normalizeUnit(unit)
  
  // For count units, we can't convert - return zero or use a default
  if (unitType === 'count') {
    // For count units, assume average weight (this is a simplification)
    // You might want to store ingredient-specific weights
    return {
      energyKcal: 0,
      proteins: 0,
      carbohydrates: 0,
      fat: 0,
      fiber: 0,
      sugars: 0,
      salt: 0,
      sodium: 0
    }
  }
  
  // Convert amount to grams
  let amountInGrams: number
  
  if (unitType === 'weight') {
    // Already in weight units, convert to grams
    const gramsPerUnit: Record<string, number> = {
      'g': 1,
      'grams': 1,
      'kg': 1000,
      'oz': 28.3495,
      'lb': 453.592
    }
    const factor = gramsPerUnit[normalizedUnit] || 1
    amountInGrams = amount * factor
  } else {
    // Volume units - need density conversion
    // This is simplified - real conversion requires ingredient-specific densities
    // For now, use approximate conversions (ml to grams)
    const mlPerUnit: Record<string, number> = {
      'ml': 1,
      'l': 1000,
      'tsp': 4.92892,
      'tbsp': 14.7868,
      'cups': 236.588,
      'cup': 236.588
    }
    const ml = amount * (mlPerUnit[normalizedUnit] || 1)
    // Approximate: 1ml ≈ 1g for most liquids, but this varies by ingredient
    // For better accuracy, you'd need ingredient-specific density tables
    amountInGrams = ml
  }
  
  // Calculate nutrition for the amount
  const factor = amountInGrams / 100 // Convert to per 100g factor
  
  return {
    energyKcal: nutritionPer100g.energyKcal * factor,
    proteins: nutritionPer100g.proteins * factor,
    carbohydrates: nutritionPer100g.carbohydrates * factor,
    fat: nutritionPer100g.fat * factor,
    fiber: nutritionPer100g.fiber * factor,
    sugars: nutritionPer100g.sugars * factor,
    salt: nutritionPer100g.salt * factor,
    sodium: nutritionPer100g.sodium * factor
  }
}

/**
 * Aggregate nutrition from multiple ingredients
 */
export function aggregateNutrition(
  ingredients: Array<{
    ingredientId: string
    ingredientName: string
    amount: number
    unit: string
    nutritionPer100g: NutritionData | null
  }>,
  servings: number = 1
): RecipeNutrition {
  const total: NutritionData = {
    energyKcal: 0,
    proteins: 0,
    carbohydrates: 0,
    fat: 0,
    fiber: 0,
    sugars: 0,
    salt: 0,
    sodium: 0
  }
  
  const ingredientNutritions: RecipeIngredientNutrition[] = []
  
  for (const ingredient of ingredients) {
    let nutrition: NutritionData
    
    if (ingredient.nutritionPer100g) {
      nutrition = convertNutritionToUnit(
        ingredient.nutritionPer100g,
        ingredient.amount,
        ingredient.unit
      )
    } else {
      // No nutrition data available
      nutrition = {
        energyKcal: 0,
        proteins: 0,
        carbohydrates: 0,
        fat: 0,
        fiber: 0,
        sugars: 0,
        salt: 0,
        sodium: 0
      }
    }
    
    // Add to total
    total.energyKcal += nutrition.energyKcal
    total.proteins += nutrition.proteins
    total.carbohydrates += nutrition.carbohydrates
    total.fat += nutrition.fat
    total.fiber += nutrition.fiber
    total.sugars += nutrition.sugars
    total.salt += nutrition.salt
    total.sodium += nutrition.sodium
    
    ingredientNutritions.push({
      ingredientId: ingredient.ingredientId,
      ingredientName: ingredient.ingredientName,
      amount: ingredient.amount,
      unit: ingredient.unit,
      nutrition
    })
  }
  
  // Calculate per serving
  const perServing: NutritionData = {
    energyKcal: total.energyKcal / servings,
    proteins: total.proteins / servings,
    carbohydrates: total.carbohydrates / servings,
    fat: total.fat / servings,
    fiber: total.fiber / servings,
    sugars: total.sugars / servings,
    salt: total.salt / servings,
    sodium: total.sodium / servings
  }
  
  return {
    total,
    perServing,
    servings,
    ingredients: ingredientNutritions
  }
}
