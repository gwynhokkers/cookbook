import { describe, expect, it } from 'vitest'
import {
  SESSION_MAX_AGE_SECONDS,
  SESSION_SLIDE_AFTER_SECONDS,
  planSessionRefresh,
  toSessionUser,
  type SessionUser
} from '~~/server/utils/sessionRefresh'

const sealed: SessionUser = {
  id: 'user-1',
  name: 'Ada',
  email: 'ada@example.com',
  image: 'https://example.com/a.png',
  role: 'editor'
}

describe('session constants', () => {
  it('keeps a session for 7 days and slides after 1 day', () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 7)
    expect(SESSION_SLIDE_AFTER_SECONDS).toBe(60 * 60 * 24)
  })
})

describe('toSessionUser', () => {
  it('fills empty name and image and maps unknown roles to viewer', () => {
    expect(toSessionUser({
      id: 'user-1',
      name: null,
      email: 'ada@example.com',
      image: null,
      role: 'nope'
    })).toEqual({
      id: 'user-1',
      name: '',
      email: 'ada@example.com',
      image: '',
      role: 'viewer'
    })
  })
})

describe('planSessionRefresh', () => {
  const now = 1_700_000_000_000

  it('does nothing when there is no sealed user', () => {
    expect(planSessionRefresh({
      sealedUser: null,
      dbUser: sealed,
      createdAt: now,
      now
    })).toEqual({ action: 'none' })
  })

  it('clears the session when the user row is gone', () => {
    expect(planSessionRefresh({
      sealedUser: sealed,
      dbUser: null,
      createdAt: now,
      now
    })).toEqual({ action: 'clear' })
  })

  it('does nothing when the payload matches and the session is younger than 1 day', () => {
    expect(planSessionRefresh({
      sealedUser: sealed,
      dbUser: sealed,
      createdAt: now - (SESSION_SLIDE_AFTER_SECONDS * 1000) + 1,
      now
    })).toEqual({ action: 'none' })
  })

  it('reseals without sliding when the database role differs and the session is young', () => {
    expect(planSessionRefresh({
      sealedUser: sealed,
      dbUser: { ...sealed, role: 'viewer' },
      createdAt: now,
      now
    })).toEqual({
      action: 'reseal',
      user: { ...sealed, role: 'viewer' },
      slide: false
    })
  })

  it('slides when the session is at least 1 day old', () => {
    expect(planSessionRefresh({
      sealedUser: sealed,
      dbUser: sealed,
      createdAt: now - SESSION_SLIDE_AFTER_SECONDS * 1000,
      now
    })).toEqual({
      action: 'reseal',
      user: sealed,
      slide: true
    })
  })
})
