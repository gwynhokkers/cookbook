import { z } from 'zod'
import { renameHumphrySession } from '../../../utils/humphrySessions'
import { requireShoppingUserId } from '../../../utils/shoppingAuth'

const bodySchema = z.object({
  title: z.string().min(1).max(70)
})

export default defineEventHandler(async (event) => {
  const userId = await requireShoppingUserId(event)
  const sessionId = getRouterParam(event, 'id')
  if (!sessionId) {
    throw createError({ statusCode: 400, statusMessage: 'Session ID is required' })
  }

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid title' })
  }

  return renameHumphrySession(sessionId, userId, parsed.data.title)
})
