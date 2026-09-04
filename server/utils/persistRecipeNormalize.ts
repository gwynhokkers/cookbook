export type PersistIngredientInput = {
  ingredientName?: string
  amount?: string | number
  unit?: string
  notes?: string | null
  ingredientId?: string
  spoonacularIngredientId?: string | number | null
  spoonacularData?: Record<string, unknown> | null
}

export type NormalizedPersistStep = { title: string; content: string }

export type NormalizedPersistIngredient = {
  ingredientName: string
  amount: string
  unit: string
  notes: string | null
  ingredientId?: string
  spoonacularIngredientId?: string | null
  spoonacularData?: Record<string, unknown> | null
  order: string
}

/** Pure: normalize steps for storage (drop empty content). */
export function normalizePersistSteps(
  steps: Array<{ title?: string; content?: string }> | undefined
): NormalizedPersistStep[] {
  if (!Array.isArray(steps)) return []
  return steps
    .map((step) => ({
      title: String(step?.title || '').trim() || 'Step',
      content: String(step?.content || '').trim()
    }))
    .filter((step) => step.content)
}

function normalizeSpoonacularId(
  value: string | number | null | undefined
): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  return String(value)
}

/** Pure: normalize ingredient rows; drop empty names; default amount/unit. */
export function normalizePersistIngredients(
  ingredients: PersistIngredientInput[] | undefined
): NormalizedPersistIngredient[] {
  if (!Array.isArray(ingredients)) return []
  const out: NormalizedPersistIngredient[] = []
  for (let i = 0; i < ingredients.length; i++) {
    const row = ingredients[i]
    const ingredientName = String(row?.ingredientName || '').trim()
    if (!ingredientName && !row?.ingredientId) continue
    const spoonacularIngredientId = normalizeSpoonacularId(row?.spoonacularIngredientId)
    out.push({
      ingredientName,
      amount: String(row?.amount ?? '').trim() || '1',
      unit: String(row?.unit ?? '').trim() || 'pieces',
      notes: row?.notes ? String(row.notes).trim() : null,
      ingredientId: row?.ingredientId ? String(row.ingredientId).trim() : undefined,
      spoonacularIngredientId,
      spoonacularData: row?.spoonacularData === undefined
        ? undefined
        : (row.spoonacularData ?? null),
      order: String(i)
    })
  }
  return out
}
