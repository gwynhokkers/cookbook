import {
  enrichIngredientsViaParse,
  linkIngredients,
  selectValidIngredients,
  syncRecipeIngredients,
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

/**
 * Shared create/update flow: validate ingredients, enrich via Spoonacular parse,
 * persist recipe metadata, then link or sync recipe_ingredient rows.
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
      const ingredients = data.ingredients || []
      const recipeBody = { ...data }
      delete recipeBody.ingredients

      const validIngredients = await prepareIngredients(ingredients)

      const recipe = await $fetch<SavedRecipe>('/api/recipes', {
        method: 'POST',
        body: recipeBody
      })

      await linkIngredients(recipe.id, validIngredients)
      return recipe
    } finally {
      submitting.value = false
    }
  }

  async function updateRecipe(recipeId: string, data: RecipeSavePayload): Promise<void> {
    submitting.value = true
    try {
      const ingredients = data.ingredients || []
      const recipeBody = { ...data }
      delete recipeBody.ingredients

      const validIngredients = await prepareIngredients(ingredients)

      await $fetch(`/api/recipes/${recipeId}`, {
        method: 'PUT',
        body: recipeBody,
        credentials: 'include'
      })

      await syncRecipeIngredients(recipeId, validIngredients)
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
