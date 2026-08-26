import { describe, expect, it } from 'vitest'
import { allows } from 'nuxt-authorization/utils'
import {
  createRecipe,
  manageShoppingList,
  manageUsers,
  viewRecipe
} from '../../../shared/utils/abilities'

const viewer = { id: 'user-1', role: 'viewer' as const }
const editor = { id: 'user-2', role: 'editor' as const }
const admin = { id: 'user-3', role: 'admin' as const }

describe('viewRecipe ability', () => {
  it('allows guests to view public recipes', async () => {
    expect(await allows(viewRecipe, null, { visibility: 'public' })).toBe(true)
  })

  it('denies guests from viewing private recipes', async () => {
    expect(await allows(viewRecipe, null, { visibility: 'private' })).toBe(false)
  })

  it('allows signed-in users to view private recipes', async () => {
    expect(await allows(viewRecipe, viewer, { visibility: 'private' })).toBe(true)
  })
})

describe('createRecipe ability', () => {
  it('allows editors and admins', async () => {
    expect(await allows(createRecipe, editor)).toBe(true)
    expect(await allows(createRecipe, admin)).toBe(true)
  })

  it('denies viewers and guests', async () => {
    expect(await allows(createRecipe, viewer)).toBe(false)
    expect(await allows(createRecipe, null)).toBe(false)
  })
})

describe('manageUsers ability', () => {
  it('allows only admins', async () => {
    expect(await allows(manageUsers, admin)).toBe(true)
    expect(await allows(manageUsers, editor)).toBe(false)
    expect(await allows(manageUsers, viewer)).toBe(false)
  })
})

describe('manageShoppingList ability', () => {
  it('allows the list owner', async () => {
    expect(await allows(manageShoppingList, viewer, { userId: 'user-1' })).toBe(true)
  })

  it('denies other users', async () => {
    expect(await allows(manageShoppingList, editor, { userId: 'user-1' })).toBe(false)
  })
})
