import type { InviteRole } from './inviteToken'

export type OAuthProfile = {
  provider: 'github' | 'google'
  providerId: string
  email: string
  name: string
  image: string | null
}

export type ExistingUser = {
  id: string
  name: string | null
  email: string
  image: string | null
  role: string
  githubId: string | null
  googleId: string | null
}

export type LoginDecision =
  | {
      kind: 'sign-in'
      userId: string
      patch: {
        name: string
        image?: string | null
        role: InviteRole
        githubId?: string
        googleId?: string
      }
      sessionUser: {
        id: string
        name: string
        email: string
        image: string
        role: InviteRole
      }
    }
  | { kind: 'create'; role: InviteRole; inviteId: string | null }
  | { kind: 'reject' }

function asRole(role: string): InviteRole {
  if (role === 'editor' || role === 'admin') return role
  return 'viewer'
}

export function decideOAuthLogin(input: {
  profile: OAuthProfile
  existing: ExistingUser | null
  invite: { id: string; role: InviteRole } | null
  isEnvAdmin: boolean
}): LoginDecision {
  const email = input.profile.email.trim()
  const image = input.profile.image

  if (input.existing) {
    const role: InviteRole = input.isEnvAdmin ? 'admin' : asRole(input.existing.role)
    const providerKey = input.profile.provider === 'github' ? 'githubId' : 'googleId'
    const alreadyLinked = Boolean(input.existing[providerKey])
    const patch: {
      name: string
      image?: string | null
      role: InviteRole
      githubId?: string
      googleId?: string
    } = {
      name: input.profile.name,
      role
    }
    if (image != null) {
      patch.image = image
    }
    if (!alreadyLinked) {
      patch[providerKey] = input.profile.providerId
    }
    return {
      kind: 'sign-in',
      userId: input.existing.id,
      patch,
      sessionUser: {
        id: input.existing.id,
        name: input.profile.name || input.existing.name || email,
        email: input.existing.email,
        image: image ?? input.existing.image ?? '',
        role
      }
    }
  }

  if (!email) return { kind: 'reject' }
  if (input.isEnvAdmin) return { kind: 'create', role: 'admin', inviteId: null }
  if (input.invite) return { kind: 'create', role: input.invite.role, inviteId: input.invite.id }
  return { kind: 'reject' }
}
