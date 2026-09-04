import { describe, expect, it } from 'vitest'
import {
  normalizePersistIngredients,
  normalizePersistSteps
} from '~~/server/utils/persistRecipeNormalize'
import { buildRecipeSearchDocumentFromAggregate } from '~~/server/utils/recipeSearchDocument'

describe('normalizePersistSteps', () => {
  it('keeps contentful steps and defaults empty titles', () => {
    expect(normalizePersistSteps([
      { title: '', content: 'Toast seeds.' },
      { title: 'Step 2', content: '  ' },
      { content: 'Melt jaggery.' }
    ])).toEqual([
      { title: 'Step', content: 'Toast seeds.' },
      { title: 'Step', content: 'Melt jaggery.' }
    ])
  })
})

describe('normalizePersistIngredients', () => {
  it('drops empty names, defaults amount/unit, preserves order index', () => {
    expect(normalizePersistIngredients([
      { ingredientName: '  salt  ', amount: '', unit: '' },
      { ingredientName: '' },
      { ingredientName: 'ghee', amount: 2, unit: 'tbsp', notes: ' melted ' }
    ])).toEqual([
      {
        ingredientName: 'salt',
        amount: '1',
        unit: 'pieces',
        notes: null,
        ingredientId: undefined,
        order: '0'
      },
      {
        ingredientName: 'ghee',
        amount: '2',
        unit: 'tbsp',
        notes: 'melted',
        ingredientId: undefined,
        order: '2'
      }
    ])
  })

  it('keeps rows that only have ingredientId', () => {
    expect(normalizePersistIngredients([
      { ingredientId: 'ing_1', amount: '1', unit: 'tsp' }
    ])).toEqual([
      {
        ingredientName: '',
        amount: '1',
        unit: 'tsp',
        notes: null,
        ingredientId: 'ing_1',
        order: '0'
      }
    ])
  })
})

describe('persist aggregate → FTS document', () => {
  it('includes linked ingredient names without a second DB read', () => {
    const steps = normalizePersistSteps([
      { title: 'Step 1', content: 'Mix.' }
    ])
    const ingredients = normalizePersistIngredients([
      { ingredientName: 'flour' },
      { ingredientName: 'water' }
    ])
    const doc = buildRecipeSearchDocumentFromAggregate({
      recipeId: 'abc',
      title: 'Dough',
      description: null,
      tags: ['bread'],
      source: 'Ayla — Santosh Shah',
      steps,
      ingredientNames: ingredients.map((i) => i.ingredientName)
    })
    expect(doc.ingredients).toBe('flour water')
    expect(doc.book).toBe('Ayla')
    expect(doc.steps).toContain('Mix.')
  })
})
