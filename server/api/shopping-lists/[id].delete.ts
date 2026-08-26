import { deleteShoppingList } from '../../utils/shoppingLists'
import { requireShoppingUserId } from '../../utils/shoppingAuth'

export default defineEventHandler(async (event) => {
  const userId = await requireShoppingUserId(event)
  const listId = getRouterParam(event, 'id')
  if (!listId) {
    throw createError({ statusCode: 400, statusMessage: 'List ID is required' })
  }

  return deleteShoppingList(listId, userId)
})
