import { z } from 'zod'
import { setShoppingListRecipes } from '../../../utils/shoppingLists'
import { requireShoppingUserId } from '../../../utils/shoppingAuth'

const bodySchema = z.object({
  recipeIds: z.array(z.string().min(1)).max(50)
})

export default defineEventHandler(async (event) => {
  const userId = await requireShoppingUserId(event)
  const listId = getRouterParam(event, 'id')
  if (!listId) {
    throw createError({ statusCode: 400, statusMessage: 'List ID is required' })
  }

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid recipeIds payload' })
  }

  return setShoppingListRecipes(event, listId, userId, parsed.data.recipeIds, 'replace')
})
