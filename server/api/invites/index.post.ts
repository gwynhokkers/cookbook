import { manageUsers } from '~~/shared/utils/abilities'
import { createInvite } from '../../utils/invites'
import { parseInviteRole } from '../../utils/inviteToken'

export default defineEventHandler(async (event) => {
  await authorize(event, manageUsers)
  const body = await readBody(event)
  const role = parseInviteRole(body?.role)
  if (!role) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid role. Must be one of: viewer, editor, admin' })
  }
  const session = await requireUserSession(event)
  const origin = getRequestURL(event).origin
  return createInvite(session.user.id, role, origin)
})
