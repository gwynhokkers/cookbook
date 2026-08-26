import { getOrCreateShoppingList, listShoppingLists, isValidListDate } from '../../utils/shoppingLists'
import { requireShoppingUserId } from '../../utils/shoppingAuth'

export default defineEventHandler(async (event) => {
  const userId = await requireShoppingUserId(event)
  const query = getQuery(event)

  if (typeof query.date === 'string' && query.date) {
    if (!isValidListDate(query.date)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid date. Use YYYY-MM-DD.'
      })
    }
    return getOrCreateShoppingList(userId, query.date)
  }

  const limit = Number(query.limit || 30)
  return listShoppingLists(userId, Number.isFinite(limit) ? limit : 30)
})
