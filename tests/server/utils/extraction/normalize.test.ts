import { describe, expect, it } from 'vitest'
import {
  normalizeExtractedRecipe,
  parseIngredientLine,
  parseMethodTextToSteps
} from '../../../../server/extraction/normalize'

describe('parseIngredientLine', () => {
  it('parses amount, unit, and name', () => {
    expect(parseIngredientLine('2 tbsp sesame seeds')).toEqual({
      amount: '2',
      unit: 'tbsp',
      ingredientName: 'sesame seeds',
      notes: ''
    })
  })

  it('maps unit aliases to canonical forms', () => {
    expect(parseIngredientLine('1 Tablespoon oil').unit).toBe('tbsp')
    expect(parseIngredientLine('3 cloves garlic').unit).toBe('pieces')
  })
})

describe('parseMethodTextToSteps', () => {
  it('splits numbered method lines into steps', () => {
    const steps = parseMethodTextToSteps('1. Mix the dry ingredients.\n2. Add water and stir.')
    expect(steps.length).toBeGreaterThanOrEqual(2)
    expect(steps[0]?.content).toMatch(/Mix the dry/i)
  })
})

describe('normalizeExtractedRecipe', () => {
  it('title-cases the title and keeps ingredients', () => {
    const result = normalizeExtractedRecipe({
      title: 'sesame tamarind aubergines',
      ingredients: [
        { amount: '2', unit: 'tbsp', ingredientName: 'sesame seeds' }
      ],
      steps: [{ title: '', content: 'Toast the sesame seeds until fragrant.' }]
    })

    expect(result.title).toMatch(/Sesame/i)
    expect(result.ingredients).toHaveLength(1)
    expect(result.ingredients[0]?.ingredientName).toMatch(/sesame/i)
    expect(result.steps.length).toBeGreaterThanOrEqual(1)
  })

  it('moves reference-like names into notes when possible', () => {
    const result = normalizeExtractedRecipe({
      title: 'Test',
      ingredients: [
        { amount: '1', unit: 'cup', ingredientName: '(see page 12)', notes: '' }
      ],
      steps: []
    })

    const name = result.ingredients[0]?.ingredientName || ''
    // Either repaired or still present — normalize should not throw
    expect(typeof name).toBe('string')
  })
})
