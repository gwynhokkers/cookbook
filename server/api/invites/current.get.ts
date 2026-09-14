import { findSpendableInviteByToken } from '../../utils/invites'
import { INVITE_COOKIE } from '../../utils/inviteToken'

export default defineEventHandler(async (event) => {
  const token = getCookie(event, INVITE_COOKIE)
  if (!token) {
    throw createError({ statusCode: 404, statusMessage: 'No invite' })
  }
  const invite = await findSpendableInviteByToken(token)
  if (!invite) {
    throw createError({ statusCode: 404, statusMessage: 'No invite' })
  }
  return { role: invite.role, expiresAt: invite.expiresAt }
})
