import {
  enrichIngredientsViaParse,
  selectValidIngredients,
  type FormIngredient
} from '~/composables/recipeIngredientSync'

export interface RecipeSavePayload {
  title: string
  description?: string
  imageUrl?: string | null
  date: string
  tags?: string[]
  source?: string
  visibility?: 'public' | 'private'
  servings?: number | null
  ingredients?: FormIngredient[]
  steps?: Array<{ title: string; content: string }>
  [key: string]: unknown
}

export interface SavedRecipe {
  id: string
  title: string
}

function toPersistIngredients(ingredients: FormIngredient[]) {
  return ingredients.map(ing => ({
    ingredientName: ing.ingredientName,
    amount: ing.amount,
    unit: ing.unit,
    notes: ing.notes || null,
    ingredientId: ing.ingredientId,
    spoonacularIngredientId: ing.spoonacularIngredientId,
    spoonacularData: ing.spoonacularData
  }))
}

/**
 * Shared create/update flow: validate ingredients, enrich via Spoonacular parse,
 * then persist recipe + ingredients in one request (full replace on update).
 */
export function useRecipeSave() {
  const submitting = ref(false)

  async function prepareIngredients(ingredients: FormIngredient[] = []) {
    const validIngredients = selectValidIngredients(ingredients)
    await enrichIngredientsViaParse(validIngredients)
    return validIngredients
  }

  async function createRecipe(data: RecipeSavePayload): Promise<SavedRecipe> {
    submitting.value = true
    try {
      const validIngredients = await prepareIngredients(data.ingredients || [])

      return await $fetch<SavedRecipe>('/api/recipes', {
        method: 'POST',
        body: {
          ...data,
          ingredients: toPersistIngredients(validIngredients)
        }
      })
    } finally {
      submitting.value = false
    }
  }

  async function updateRecipe(recipeId: string, data: RecipeSavePayload): Promise<void> {
    submitting.value = true
    try {
      const validIngredients = await prepareIngredients(data.ingredients || [])

      await $fetch(`/api/recipes/${recipeId}`, {
        method: 'PUT',
        body: {
          ...data,
          ingredients: toPersistIngredients(validIngredients)
        },
        credentials: 'include'
      })
    } finally {
      submitting.value = false
    }
  }

  return {
    submitting,
    createRecipe,
    updateRecipe
  }
}
