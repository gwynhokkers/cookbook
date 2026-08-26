import { z } from 'zod'
import { setShoppingListItemChecked } from '../../../../utils/shoppingLists'
import { requireShoppingUserId } from '../../../../utils/shoppingAuth'

const bodySchema = z.object({
  checked: z.boolean()
})

export default defineEventHandler(async (event) => {
  const userId = await requireShoppingUserId(event)
  const listId = getRouterParam(event, 'id')
  const itemId = getRouterParam(event, 'itemId')

  if (!listId || !itemId) {
    throw createError({ statusCode: 400, statusMessage: 'List ID and item ID are required' })
  }

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid checked payload' })
  }

  return setShoppingListItemChecked(listId, itemId, userId, parsed.data.checked)
})
