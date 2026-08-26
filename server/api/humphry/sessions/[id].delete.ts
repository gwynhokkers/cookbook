import { deleteHumphrySession } from '../../../utils/humphrySessions'
import { requireShoppingUserId } from '../../../utils/shoppingAuth'

export default defineEventHandler(async (event) => {
  const userId = await requireShoppingUserId(event)
  const sessionId = getRouterParam(event, 'id')
  if (!sessionId) {
    throw createError({ statusCode: 400, statusMessage: 'Session ID is required' })
  }

  return deleteHumphrySession(sessionId, userId)
})
