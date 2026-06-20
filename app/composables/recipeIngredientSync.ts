import {
  isCountUnit,
  normalizeParsedIngredient,
  type ParsedSpoonacularIngredient
} from '~~/shared/utils/formatIngredient'

export interface FormIngredient {
  lineText?: string
  amount: string | number
  unit: string
  ingredientName: string
  ingredientId?: string
  spoonacularIngredientId?: number
  spoonacularData?: Record<string, unknown>
  notes?: string
}

interface ExistingRecipeIngredient {
  id: string
  ingredientId: string
}

/**
 * Keep only rows that are worth saving: a name, an amount, and a unit (the count sentinel
 * counts as a valid unit so "1 lemon" rows aren't dropped).
 */
export function selectValidIngredients(ingredients: FormIngredient[]): FormIngredient[] {
  return (ingredients || []).filter(ing =>
    Boolean(ing?.ingredientName?.trim())
    && Boolean(String(ing?.amount ?? '').trim())
    && Boolean(ing?.unit || isCountUnit(ing?.unit))
  )
}

/**
 * Safety net: for any row that has a natural-language line but no Spoonacular nutrition
 * yet (e.g. picked from autocomplete, or never debounced-parsed), run one batched parse so
 * the saved ingredient gets a Spoonacular id + nutrition. Mutates the rows in place.
 */
export async function enrichIngredientsViaParse(ingredients: FormIngredient[]): Promise<void> {
  const toParse = ingredients.filter(ing => Boolean((ing.lineText || '').trim()) && !ing.spoonacularData)
  if (toParse.length === 0) return

  let parsed: ParsedSpoonacularIngredient[] = []
  try {
    parsed = await $fetch<ParsedSpoonacularIngredient[]>('/api/spoonacular/ingredients/parse', {
      method: 'POST',
      body: { ingredients: toParse.map(ing => (ing.lineText || '').trim()) }
    })
  } catch (error) {
    console.error('Failed to parse ingredients on save:', error)
    return
  }

  if (!Array.isArray(parsed)) return

  const byOriginal = new Map<string, ParsedSpoonacularIngredient>()
  for (const item of parsed) {
    const key = String(item.original || '').trim().toLowerCase()
    if (key && !byOriginal.has(key)) byOriginal.set(key, item)
  }

  toParse.forEach((ing, index) => {
    const line = (ing.lineText || '').trim().toLowerCase()
    const match = byOriginal.get(line) || parsed[index]
    if (!match || !match.id) return
    const normalized = normalizeParsedIngredient(match)
    if (!ing.spoonacularIngredientId) ing.spoonacularIngredientId = normalized.spoonacularIngredientId
    if (!ing.spoonacularData) ing.spoonacularData = normalized.spoonacularData
  })
}

/**
 * Ensure an ingredient record exists for a row (create-or-update by name, attaching any
 * Spoonacular id/data) and return its id.
 */
async function ensureIngredientId(ing: FormIngredient): Promise<string> {
  const created = await $fetch<{ id: string }>('/api/ingredients', {
    method: 'POST',
    body: {
      name: ing.ingredientName.trim(),
      spoonacularIngredientId: ing.spoonacularIngredientId,
      spoonacularData: ing.spoonacularData
    }
  })
  return created.id
}

/**
 * Create recipe_ingredient links for a freshly created recipe.
 */
export async function linkIngredients(recipeId: string, ingredients: FormIngredient[]): Promise<void> {
  for (let i = 0; i < ingredients.length; i++) {
    const ing = ingredients[i]
    const ingredientId = await ensureIngredientId(ing)
    await $fetch(`/api/recipes/${recipeId}/ingredients`, {
      method: 'POST',
      body: {
        ingredientId,
        amount: String(ing.amount),
        unit: ing.unit,
        notes: ing.notes || null,
        order: i
      }
    })
  }
}

/**
 * Reconcile recipe_ingredient links for an edited recipe: update existing, create new,
 * delete removed.
 */
export async function syncRecipeIngredients(recipeId: string, ingredients: FormIngredient[]): Promise<void> {
  const existingIngredients = await $fetch<ExistingRecipeIngredient[]>(`/api/recipes/${recipeId}/ingredients`).catch(() => [])
  const existingIds = new Set(existingIngredients.map(ri => ri.id))

  for (let i = 0; i < ingredients.length; i++) {
    const ing = ingredients[i]
    const ingredientId = await ensureIngredientId(ing)

    const existingRI = existingIngredients.find(ri => ri.ingredientId === ingredientId)
    if (existingRI) {
      await $fetch(`/api/recipes/${recipeId}/ingredients/${existingRI.id}`, {
        method: 'PUT',
        body: {
          amount: String(ing.amount),
          unit: ing.unit,
          notes: ing.notes || null,
          order: i
        }
      })
      existingIds.delete(existingRI.id)
    } else {
      await $fetch(`/api/recipes/${recipeId}/ingredients`, {
        method: 'POST',
        body: {
          ingredientId,
          amount: String(ing.amount),
          unit: ing.unit,
          notes: ing.notes || null,
          order: i
        }
      })
    }
  }

  for (const id of existingIds) {
    await $fetch(`/api/recipes/${recipeId}/ingredients/${id}`, { method: 'DELETE' })
  }
}
