import { createRecipe } from '~~/shared/utils/abilities'
import { createPersistRecipe } from '../../utils/persistRecipe'
import type { PersistIngredientInput } from '../../utils/persistRecipeNormalize'

export default defineEventHandler(async (event) => {
  await authorize(event, createRecipe)
  const session = await requireUserSession(event)
  const body = await readBody(event)

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

  if (!title) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Title is required'
    })
  }

  const user = session.user as Record<string, unknown>
  const authorId = user.id as string
  const contributor = typeof user.name === 'string' ? user.name : ''

  const ingredientRows: PersistIngredientInput[] = Array.isArray(ingredients)
    ? ingredients.map((ing: Record<string, unknown>) => ({
        ingredientName: ing.ingredientName != null ? String(ing.ingredientName) : undefined,
        amount: ing.amount as string | number | undefined,
        unit: ing.unit != null ? String(ing.unit) : undefined,
        notes: ing.notes != null ? String(ing.notes) : null,
        ingredientId: ing.ingredientId != null ? String(ing.ingredientId) : undefined,
        spoonacularIngredientId: ing.spoonacularIngredientId as string | number | null | undefined,
        spoonacularData: (ing.spoonacularData as Record<string, unknown> | null | undefined) ?? undefined
      }))
    : []

  const result = await createPersistRecipe(
    {
      title: String(title).trim(),
      description: description || null,
      imageUrl: imageUrl || null,
      date: date ? new Date(date) : undefined,
      tags: tags || [],
      source: source || null,
      servings: servings ?? null,
      estimatedMinutes: estimatedMinutes ?? null,
      steps: steps || [],
      visibility: visibility === 'private' ? 'private' : 'public',
      authorId,
      contributor,
      ingredients: ingredientRows
    },
    {
      invalidateSearchCache: true
    }
  )

  if (!result.recipe) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create recipe'
    })
  }

  return result.recipe
})
