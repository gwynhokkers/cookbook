import { manageUsers } from '~~/shared/utils/abilities'
import { revokeInvite } from '../../utils/invites'

export default defineEventHandler(async (event) => {
  await authorize(event, manageUsers)
  const id = getRouterParam(event, 'id')
  if (!id || !(await revokeInvite(id))) {
    throw createError({ statusCode: 404, statusMessage: 'Invite not found' })
  }
  return { ok: true }
})
