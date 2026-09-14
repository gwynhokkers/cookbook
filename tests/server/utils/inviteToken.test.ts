import { describe, expect, it } from 'vitest'
import {
  INVITE_COOKIE,
  INVITE_TTL_MS,
  generateInviteToken,
  hashInviteToken,
  inviteExpiresAt,
  inviteUnavailableReason,
  isPendingInvite,
  parseInviteRole
} from '~~/server/utils/inviteToken'
import { unavailableCopy } from '~~/shared/utils/inviteCopy'

describe('invite token', () => {
  it('uses a 7-day cookie name and lifetime', () => {
    expect(INVITE_COOKIE).toBe('cookbook-invite')
    expect(INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('hashes the base64url string, not a second encoding', async () => {
    const token = 'abc'
    const hash = await hashInviteToken(token)
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(hash).toHaveLength(64)
  })

  it('generates a url-safe token and an expiry 7 days out', () => {
    const token = generateInviteToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token.length).toBeGreaterThan(20)
    const created = new Date('2026-09-14T00:00:00.000Z')
    expect(inviteExpiresAt(created).toISOString()).toBe('2026-09-21T00:00:00.000Z')
  })

  it('accepts only viewer, editor, and admin', () => {
    expect(parseInviteRole('editor')).toBe('editor')
    expect(parseInviteRole('owner')).toBeNull()
    expect(parseInviteRole(undefined)).toBeNull()
  })
})

describe('inviteUnavailableReason', () => {
  const now = new Date('2026-09-14T00:00:00.000Z')
  const live = {
    expiresAt: new Date('2026-09-20T00:00:00.000Z'),
    usedAt: null,
    revokedAt: null
  }

  it('returns null when the invite can still be spent', () => {
    expect(inviteUnavailableReason(live, now)).toBeNull()
    expect(isPendingInvite(live, now)).toBe(true)
  })

  it('reports missing, revoked, used, then expired', () => {
    expect(inviteUnavailableReason(null, now)).toBe('missing')
    expect(inviteUnavailableReason({ ...live, revokedAt: now }, now)).toBe('revoked')
    expect(inviteUnavailableReason({ ...live, usedAt: now }, now)).toBe('used')
    expect(inviteUnavailableReason({
      ...live,
      expiresAt: new Date('2026-09-13T00:00:00.000Z')
    }, now)).toBe('expired')
  })

  it('does not treat an expired invite as pending', () => {
    expect(isPendingInvite({
      ...live,
      expiresAt: new Date('2026-09-13T00:00:00.000Z')
    }, now)).toBe(false)
  })
})

describe('unavailableCopy', () => {
  it('explains each reason and falls back to missing', () => {
    expect(unavailableCopy('expired').title).toBe('This invite has expired')
    expect(unavailableCopy('used').title).toBe('This invite has already been used')
    expect(unavailableCopy('revoked').title).toBe('This invite was revoked')
    expect(unavailableCopy('nope').title).toBe('This invite is not valid')
  })
})
