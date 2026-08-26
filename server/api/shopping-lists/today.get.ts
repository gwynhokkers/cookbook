import { getOrCreateShoppingList } from '../../utils/shoppingLists'
import { requireShoppingUserId } from '../../utils/shoppingAuth'

function localTodayIso() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default defineEventHandler(async (event) => {
  const userId = await requireShoppingUserId(event)
  const query = getQuery(event)
  // Prefer client-provided local date to avoid UTC rollover; fall back to server local.
  const date = typeof query.date === 'string' && query.date
    ? query.date
    : localTodayIso()

  return getOrCreateShoppingList(userId, date)
})
