import { beforeEach, describe, expect, it } from 'vitest'
import { getRecipe } from '~~/mcp/src/getRecipe'
import { createTestDb, seedRecipe, type TestDb } from '../testDb'

const signedIn = { id: 'u1' }

describe('getRecipe', () => {
  let db: TestDb

  beforeEach(() => {
    db = createTestDb()
  })

  it('returns a public recipe with its steps and ingredients in order', async () => {
    await seedRecipe(db, {
      id: 'dal',
      title: 'Tarka dal',
      visibility: 'public',
      steps: [
        { title: 'Simmer', content: 'Simmer the lentils.' },
        { title: 'Tarka', content: 'Fry the spices in ghee.' }
      ],
      ingredients: [
        { name: 'cumin seeds', amount: '1', unit: 'tsp', order: '10' },
        { name: 'red lentils', amount: '250', unit: 'g', order: '2' },
        { name: 'ghee', amount: '2', unit: 'tbsp', notes: 'melted', order: '3' }
      ]
    })

    expect(await getRecipe(db, 'dal', null)).toEqual({
      id: 'dal',
      title: 'Tarka dal',
      description: 'Tarka dal description',
      imageUrl: null,
      tags: ['dinner'],
      servings: 4,
      estimatedMinutes: 30,
      source: null,
      sourceUrl: null,
      ingredients: [
        { name: 'red lentils', amount: '250', unit: 'g', notes: null },
        { name: 'ghee', amount: '2', unit: 'tbsp', notes: 'melted' },
        { name: 'cumin seeds', amount: '1', unit: 'tsp', notes: null }
      ],
      steps: [
        { title: 'Simmer', content: 'Simmer the lentils.' },
        { title: 'Tarka', content: 'Fry the spices in ghee.' }
      ]
    })
  })

  it('treats a private recipe as not found for a guest', async () => {
    await seedRecipe(db, { id: 'secret', title: 'Family curry', visibility: 'private' })

    expect(await getRecipe(db, 'secret', null)).toBeNull()
  })

  it('returns a private recipe to a signed-in user', async () => {
    await seedRecipe(db, { id: 'secret', title: 'Family curry', visibility: 'private' })

    expect(await getRecipe(db, 'secret', signedIn)).toMatchObject({ id: 'secret', title: 'Family curry' })
  })

  it('returns null for an unknown id', async () => {
    expect(await getRecipe(db, 'nope', signedIn)).toBeNull()
  })
})
