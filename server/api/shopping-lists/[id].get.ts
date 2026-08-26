import { loadShoppingListDto } from '../../utils/shoppingLists'
import { assertShoppingListOwned } from '../../utils/shoppingListAmalgamate'
import { requireShoppingUserId } from '../../utils/shoppingAuth'

export default defineEventHandler(async (event) => {
  const userId = await requireShoppingUserId(event)
  const listId = getRouterParam(event, 'id')
  if (!listId) {
    throw createError({ statusCode: 400, statusMessage: 'List ID is required' })
  }

  await assertShoppingListOwned(listId, userId)
  return loadShoppingListDto(listId)
})
