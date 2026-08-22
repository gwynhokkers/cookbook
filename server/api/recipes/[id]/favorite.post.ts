import { addFavorite, assertRecipeCanBeFavorited } from '../../../utils/recipeFavorites'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = (session.user as Record<string, unknown>).id as string
  const recipeId = getRouterParam(event, 'id')

  if (!recipeId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Recipe ID is required'
    })
  }

  await assertRecipeCanBeFavorited(event, recipeId)
  await addFavorite(userId, recipeId)

  return { favorited: true }
})
