import { describe, expect, it } from 'vitest'
import { decideOAuthLogin, type ExistingUser } from '~~/server/utils/oauthLoginDecision'

const profile = {
  provider: 'github' as const,
  providerId: '99',
  email: 'ada@example.com',
  name: 'Ada',
  image: 'https://example.com/a.png'
}

const existing: ExistingUser = {
  id: 'user-1',
  name: 'Old',
  email: 'ada@example.com',
  image: null,
  role: 'editor',
  githubId: null,
  googleId: null
}

describe('decideOAuthLogin', () => {
  it('signs in an existing user, attaches the provider, and does not consume the invite', () => {
    const decision = decideOAuthLogin({
      profile,
      existing,
      invite: { id: 'inv-1', role: 'admin' },
      isEnvAdmin: false
    })
    expect(decision).toEqual({
      kind: 'sign-in',
      userId: 'user-1',
      patch: {
        name: 'Ada',
        image: 'https://example.com/a.png',
        role: 'editor',
        githubId: '99'
      },
      sessionUser: {
        id: 'user-1',
        name: 'Ada',
        email: 'ada@example.com',
        image: 'https://example.com/a.png',
        role: 'editor'
      }
    })
  })

  it('promotes an existing env admin and still does not consume the invite', () => {
    const decision = decideOAuthLogin({
      profile,
      existing,
      invite: { id: 'inv-1', role: 'viewer' },
      isEnvAdmin: true
    })
    expect(decision.kind).toBe('sign-in')
    if (decision.kind === 'sign-in') expect(decision.patch.role).toBe('admin')
  })

  it('does not overwrite an existing image when the provider picture is null', () => {
    const decision = decideOAuthLogin({
      profile: { ...profile, image: null },
      existing: { ...existing, image: 'https://example.com/kept.png' },
      invite: null,
      isEnvAdmin: false
    })
    expect(decision.kind).toBe('sign-in')
    if (decision.kind === 'sign-in') {
      expect(decision.patch.image).toBeUndefined()
      expect(decision.sessionUser.image).toBe('https://example.com/kept.png')
    }
  })

  it('does not attach a provider id that is already set', () => {
    const decision = decideOAuthLogin({
      profile,
      existing: { ...existing, githubId: '99' },
      invite: null,
      isEnvAdmin: false
    })
    expect(decision.kind).toBe('sign-in')
    if (decision.kind === 'sign-in') expect(decision.patch.githubId).toBeUndefined()
  })

  it('rejects a new user with a blank email even if they are an env admin', () => {
    expect(decideOAuthLogin({
      profile: { ...profile, email: '  ' },
      existing: null,
      invite: { id: 'inv-1', role: 'editor' },
      isEnvAdmin: true
    })).toEqual({ kind: 'reject' })
  })

  it('creates an env admin without an invite id', () => {
    expect(decideOAuthLogin({
      profile,
      existing: null,
      invite: { id: 'inv-1', role: 'viewer' },
      isEnvAdmin: true
    })).toEqual({ kind: 'create', role: 'admin', inviteId: null })
  })

  it('creates a new user at the invited role', () => {
    expect(decideOAuthLogin({
      profile,
      existing: null,
      invite: { id: 'inv-1', role: 'editor' },
      isEnvAdmin: false
    })).toEqual({ kind: 'create', role: 'editor', inviteId: 'inv-1' })
  })

  it('rejects a new user with no spendable invite', () => {
    expect(decideOAuthLogin({
      profile,
      existing: null,
      invite: null,
      isEnvAdmin: false
    })).toEqual({ kind: 'reject' })
  })
})
