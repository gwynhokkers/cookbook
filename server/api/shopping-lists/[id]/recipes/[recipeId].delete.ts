import { removeShoppingListRecipe } from '../../../../utils/shoppingLists'
import { requireShoppingUserId } from '../../../../utils/shoppingAuth'

export default defineEventHandler(async (event) => {
  const userId = await requireShoppingUserId(event)
  const listId = getRouterParam(event, 'id')
  const recipeId = getRouterParam(event, 'recipeId')

  if (!listId || !recipeId) {
    throw createError({ statusCode: 400, statusMessage: 'List ID and recipe ID are required' })
  }

  return removeShoppingListRecipe(listId, userId, recipeId)
})
