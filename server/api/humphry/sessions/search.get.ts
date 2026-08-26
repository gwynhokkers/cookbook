import { searchHumphrySessions } from '../../../utils/humphrySessions'
import { requireShoppingUserId } from '../../../utils/shoppingAuth'

export default defineEventHandler(async (event) => {
  const userId = await requireShoppingUserId(event)
  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q : ''
  const limit = Number(query.limit || 20)
  const offset = Number(query.offset || 0)

  return {
    sessions: await searchHumphrySessions(userId, q, {
      limit: Number.isFinite(limit) ? limit : 20,
      offset: Number.isFinite(offset) ? offset : 0
    })
  }
})
