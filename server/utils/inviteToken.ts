import { randomBytes } from 'node:crypto'

export const INVITE_COOKIE = 'cookbook-invite'
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export const INVITE_ROLES = ['viewer', 'editor', 'admin'] as const
export type InviteRole = typeof INVITE_ROLES[number]

export type InviteValidity = {
  expiresAt: Date
  usedAt: Date | null
  revokedAt: Date | null
}

export async function hashInviteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url')
}

export function inviteExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + INVITE_TTL_MS)
}

export function parseInviteRole(role: unknown): InviteRole | null {
  if (typeof role !== 'string') return null
  return INVITE_ROLES.includes(role as InviteRole) ? role as InviteRole : null
}

export function inviteUnavailableReason(
  invite: InviteValidity | null,
  now: Date
): 'missing' | 'expired' | 'used' | 'revoked' | null {
  if (!invite) return 'missing'
  if (invite.revokedAt) return 'revoked'
  if (invite.usedAt) return 'used'
  if (invite.expiresAt.getTime() <= now.getTime()) return 'expired'
  return null
}

export function isPendingInvite(invite: InviteValidity, now: Date): boolean {
  return inviteUnavailableReason(invite, now) === null
}

export function unavailableCopy(reason: string | null | undefined): { title: string; description: string } {
  if (reason === 'expired') {
    return {
      title: 'This invite has expired',
      description: 'Ask an admin for a new link. Invites last 7 days.'
    }
  }
  if (reason === 'used') {
    return {
      title: 'This invite has already been used',
      description: 'If you already have an account, sign in. Otherwise ask an admin for a new link.'
    }
  }
  if (reason === 'revoked') {
    return {
      title: 'This invite was revoked',
      description: 'Ask an admin for a new link.'
    }
  }
  return {
    title: 'This invite is not valid',
    description: 'Ask an admin for a new link. If you already have an account, you can sign in.'
  }
}
