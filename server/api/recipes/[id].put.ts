import { editRecipe } from '~~/shared/utils/abilities'
import { updatePersistRecipe } from '../../utils/persistRecipe'
import type { PersistIngredientInput } from '../../utils/persistRecipeNormalize'

function mapIngredients(ingredients: unknown): PersistIngredientInput[] | undefined {
  if (ingredients === undefined) return undefined
  if (!Array.isArray(ingredients)) return []
  return ingredients.map((ing: Record<string, unknown>) => ({
    ingredientName: ing.ingredientName != null ? String(ing.ingredientName) : undefined,
    amount: ing.amount as string | number | undefined,
    unit: ing.unit != null ? String(ing.unit) : undefined,
    notes: ing.notes != null ? String(ing.notes) : null,
    ingredientId: ing.ingredientId != null ? String(ing.ingredientId) : undefined,
    spoonacularIngredientId: ing.spoonacularIngredientId as string | number | null | undefined,
    spoonacularData: (ing.spoonacularData as Record<string, unknown> | null | undefined) ?? undefined
  }))
}

export default defineEventHandler(async (event) => {
  await authorize(event, editRecipe)
  const session = await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Recipe ID is required'
    })
  }

  const user = session.user as Record<string, unknown>
  const {
    title,
    description,
    imageUrl,
    date,
    tags,
    source,
    steps,
    visibility,
    servings,
    estimatedMinutes,
    ingredients
  } = body

  const result = await updatePersistRecipe(
    id,
    {
      title,
      description,
      imageUrl,
      date: date !== undefined ? new Date(date) : undefined,
      tags,
      source,
      steps,
      visibility: visibility === undefined
        ? undefined
        : (visibility === 'private' ? 'private' : 'public'),
      servings,
      estimatedMinutes,
      claimAuthorId: user.id as string,
      contributor: typeof user.name === 'string' ? user.name : '',
      ingredients: mapIngredients(ingredients)
    },
    { invalidateSearchCache: true }
  )

  return result.recipe
})
