import { describe, expect, it } from 'vitest'
import { allows } from 'nuxt-authorization/utils'
import {
  createRecipe,
  deleteRecipe,
  editRecipe,
  manageShoppingList,
  manageUsers,
  viewRecipe
} from '../../../shared/utils/abilities'

const viewer = { id: 'user-1', role: 'viewer' as const }
const editor = { id: 'user-2', role: 'editor' as const }
const admin = { id: 'user-3', role: 'admin' as const }

describe('viewRecipe Ability', () => {
  it('allows guests to view public Visibility recipes', async () => {
    expect(await allows(viewRecipe, null, { visibility: 'public' })).toBe(true)
  })

  it('allows signed-in users to view public Visibility recipes', async () => {
    expect(await allows(viewRecipe, viewer, { visibility: 'public' })).toBe(true)
  })

  it('denies guests from viewing private Visibility recipes', async () => {
    expect(await allows(viewRecipe, null, { visibility: 'private' })).toBe(false)
  })

  it('allows signed-in users to view private Visibility recipes', async () => {
    expect(await allows(viewRecipe, viewer, { visibility: 'private' })).toBe(true)
  })
})

describe('createRecipe Ability', () => {
  it('allows editor and admin Roles', async () => {
    expect(await allows(createRecipe, editor)).toBe(true)
    expect(await allows(createRecipe, admin)).toBe(true)
  })

  it('denies viewer Role and guests', async () => {
    expect(await allows(createRecipe, viewer)).toBe(false)
    expect(await allows(createRecipe, null)).toBe(false)
  })
})

describe('editRecipe Ability', () => {
  it('allows editor and admin Roles', async () => {
    expect(await allows(editRecipe, editor)).toBe(true)
    expect(await allows(editRecipe, admin)).toBe(true)
  })

  it('denies viewer Role and guests', async () => {
    expect(await allows(editRecipe, viewer)).toBe(false)
    expect(await allows(editRecipe, null)).toBe(false)
  })
})

describe('deleteRecipe Ability', () => {
  it('allows editor and admin Roles', async () => {
    expect(await allows(deleteRecipe, editor)).toBe(true)
    expect(await allows(deleteRecipe, admin)).toBe(true)
  })

  it('denies viewer Role and guests', async () => {
    expect(await allows(deleteRecipe, viewer)).toBe(false)
    expect(await allows(deleteRecipe, null)).toBe(false)
  })
})

describe('manageUsers Ability', () => {
  it('allows only the admin Role', async () => {
    expect(await allows(manageUsers, admin)).toBe(true)
    expect(await allows(manageUsers, editor)).toBe(false)
    expect(await allows(manageUsers, viewer)).toBe(false)
  })
})

describe('manageShoppingList Ability', () => {
  it('allows the Shopping list owner', async () => {
    expect(await allows(manageShoppingList, viewer, { userId: 'user-1' })).toBe(true)
  })

  it('denies non-owners of a Shopping list', async () => {
    expect(await allows(manageShoppingList, editor, { userId: 'user-1' })).toBe(false)
    expect(await allows(manageShoppingList, admin, { userId: 'user-1' })).toBe(false)
  })

  it('denies guests from managing a Shopping list', async () => {
    expect(await allows(manageShoppingList, null, { userId: 'user-1' })).toBe(false)
  })
})
