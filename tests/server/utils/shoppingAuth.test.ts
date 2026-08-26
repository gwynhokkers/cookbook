import { describe, expect, it } from 'vitest'
import { assertUserOwnsShoppingList, requireUserId } from '../../../server/utils/shoppingAuth'

describe('requireUserId', () => {
  it('throws 401 Sign in required when session has no user', () => {
    expect(() => requireUserId({})).toThrow(
      expect.objectContaining({
        statusCode: 401,
        statusMessage: 'Sign in required'
      })
    )
  })

  it('throws 401 Sign in required when user has no id', () => {
    expect(() => requireUserId({ user: {} })).toThrow(
      expect.objectContaining({
        statusCode: 401,
        statusMessage: 'Sign in required'
      })
    )
  })

  it('returns the user id when session has a user with id', () => {
    expect(requireUserId({ user: { id: 'user-1' } })).toBe('user-1')
  })
})

describe('assertUserOwnsShoppingList', () => {
  it('throws 404 Shopping list not found when list is null', () => {
    expect(() => assertUserOwnsShoppingList(null, 'user-1')).toThrow(
      expect.objectContaining({
        statusCode: 404,
        statusMessage: 'Shopping list not found'
      })
    )
  })

  it('throws 404 Shopping list not found when list is undefined', () => {
    expect(() => assertUserOwnsShoppingList(undefined, 'user-1')).toThrow(
      expect.objectContaining({
        statusCode: 404,
        statusMessage: 'Shopping list not found'
      })
    )
  })

  it('throws 404 Shopping list not found when userId does not own the list', () => {
    expect(() => assertUserOwnsShoppingList({ userId: 'other-user' }, 'user-1')).toThrow(
      expect.objectContaining({
        statusCode: 404,
        statusMessage: 'Shopping list not found'
      })
    )
  })

  it('returns the list when userId owns it', () => {
    const list = { userId: 'user-1', id: 'list-1' }
    expect(assertUserOwnsShoppingList(list, 'user-1')).toBe(list)
  })
})
