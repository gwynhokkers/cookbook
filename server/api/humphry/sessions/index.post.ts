import { createHumphrySession } from '../../../utils/humphrySessions'
import { requireShoppingUserId } from '../../../utils/shoppingAuth'

export default defineEventHandler(async (event) => {
  const userId = await requireShoppingUserId(event)
  const session = await createHumphrySession(userId)
  return { session }
})
