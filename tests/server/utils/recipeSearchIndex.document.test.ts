import { describe, expect, it } from 'vitest'
import { buildRecipeSearchDocumentFromAggregate } from '~~/server/utils/recipeSearchDocument'

describe('buildRecipeSearchDocumentFromAggregate', () => {
  it('builds FTS fields from aggregate without DB', () => {
    const doc = buildRecipeSearchDocumentFromAggregate({
      recipeId: 'r1',
      title: 'Til Ko Ladoo',
      description: 'Sesame balls',
      tags: ['nepali', 'ayla', 'sweet'],
      source: 'Ayla — Santosh Shah',
      steps: [
        { title: 'Step 1', content: 'Toast the sesame seeds.' },
        { title: 'Step 2', content: 'Melt the jaggery.' }
      ],
      ingredientNames: ['white sesame seeds', 'gud (jaggery)', 'ghee'],
      contributor: ''
    })

    expect(doc).toEqual({
      recipeId: 'r1',
      title: 'Til Ko Ladoo',
      description: 'Sesame balls',
      tags: 'nepali ayla sweet',
      source: 'Ayla — Santosh Shah',
      book: 'Ayla',
      author: 'Santosh Shah',
      ingredients: 'white sesame seeds gud (jaggery) ghee',
      steps: 'Step 1 Toast the sesame seeds. Step 2 Melt the jaggery.',
      contributor: ''
    })
  })

  it('handles nullish description/source and empty steps', () => {
    const doc = buildRecipeSearchDocumentFromAggregate({
      recipeId: 'r2',
      title: 'Bhat',
      description: null,
      tags: [],
      source: null,
      steps: [],
      ingredientNames: ['basmati rice'],
      contributor: 'Gwyn'
    })

    expect(doc.description).toBe('')
    expect(doc.source).toBe('')
    expect(doc.book).toBe('')
    expect(doc.author).toBe('')
    expect(doc.steps).toBe('')
    expect(doc.ingredients).toBe('basmati rice')
    expect(doc.contributor).toBe('Gwyn')
  })
})
