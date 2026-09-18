import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db, schema } from '../db'
import { claimInvite, findSpendableInviteByToken, releaseInvite } from './invites'
import { INVITE_COOKIE, parseInviteRole } from './inviteToken'
import { redeemInviteAccount } from './inviteRedeem'
import { decideOAuthLogin, type OAuthProfile } from './oauthLoginDecision'

function splitIds(value: string | undefined): string[] {
  return (value || '').split(',').map(part => part.trim()).filter(Boolean)
}

export async function completeOAuthLogin(
  event: Parameters<typeof getUserSession>[0],
  profile: OAuthProfile & { emailVerified: boolean }
) {
  const email = profile.email.trim()
  const providerColumn = profile.provider === 'github' ? schema.users.githubId : schema.users.googleId

  const existingByProvider = await db.select()
    .from(schema.users)
    .where(eq(providerColumn, profile.providerId))
    .limit(1)
    .then(rows => rows[0] ?? null)

  const existingByEmail = email
    ? await db.select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1)
      .then(rows => rows[0] ?? null)
    : null

  const config = useRuntimeConfig(event)
  const adminIds = profile.provider === 'github'
    ? splitIds(config.adminGithubIds)
    : splitIds(config.adminGoogleIds)

  const cookie = getCookie(event, INVITE_COOKIE)
  const found = cookie ? await findSpendableInviteByToken(cookie) : null
  const invite = found && parseInviteRole(found.role)
    ? { id: found.id, role: parseInviteRole(found.role)! }
    : null

  const { emailVerified, ...decisionProfile } = profile
  const decision = decideOAuthLogin({
    profile: { ...decisionProfile, email },
    existing: existingByProvider ?? existingByEmail,
    invite,
    isEnvAdmin: adminIds.includes(profile.providerId)
  })

  if (decision.kind === 'reject') {
    return sendRedirect(event, '/login?error=invite_required')
  }

  if (decision.kind === 'sign-in') {
    await db.update(schema.users)
      .set({ ...decision.patch, updatedAt: new Date() })
      .where(eq(schema.users.id, decision.userId))
    await setUserSession(event, { user: decision.sessionUser })
    return sendRedirect(event, '/')
  }

  const userId = nanoid()
  const result = await redeemInviteAccount({
    inviteId: decision.inviteId,
    claim: claimInvite,
    insertUser: async () => {
      await db.insert(schema.users).values({
        id: userId,
        name: profile.name || email.split('@')[0],
        email,
        image: profile.image,
        emailVerified,
        role: decision.role,
        githubId: profile.provider === 'github' ? profile.providerId : null,
        googleId: profile.provider === 'google' ? profile.providerId : null
      })
    },
    release: releaseInvite
  })

  if (result === 'unclaimed') {
    return sendRedirect(event, '/login?error=invite_required')
  }

  if (decision.inviteId) {
    deleteCookie(event, INVITE_COOKIE)
  }

  await setUserSession(event, {
    user: {
      id: userId,
      name: profile.name || email.split('@')[0],
      email,
      image: profile.image || '',
      role: decision.role
    }
  })
  return sendRedirect(event, '/')
}
