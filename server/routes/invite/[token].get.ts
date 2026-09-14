import { eq } from 'drizzle-orm'
import { db, schema } from '../../db'
import { INVITE_COOKIE, hashInviteToken, inviteUnavailableReason } from '../../utils/inviteToken'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') || ''
  const tokenHash = await hashInviteToken(token)
  const row = token
    ? await db.select().from(schema.invites).where(eq(schema.invites.tokenHash, tokenHash)).limit(1).then(rows => rows[0] ?? null)
    : null
  const now = new Date()
  const reason = inviteUnavailableReason(row ?? null, now)
  if (reason || !row) {
    return sendRedirect(event, `/invite/unavailable?reason=${reason || 'missing'}`)
  }

  const remainingSeconds = Math.max(1, Math.floor((row.expiresAt.getTime() - now.getTime()) / 1000))
  setCookie(event, INVITE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: getRequestURL(event).protocol === 'https:',
    maxAge: remainingSeconds
  })
  return sendRedirect(event, '/login')
})
