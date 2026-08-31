import { describe, expect, it } from 'vitest'
import { auditPassed, auditRecipe } from '../../../scripts/recipe-import/lib/auditRecipe.mjs'

describe('auditRecipe', () => {
  const base = {
    title: 'Test Curry',
    source: 'Book — Author',
    visibility: 'private',
    ingredients: [{ ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'diced' }],
    steps: [{ title: 'Step 1', content: 'Heat the oil and fry the onion until golden.' }]
  }

  it('passes a clean recipe', () => {
    expect(auditPassed(auditRecipe(base))).toBe(true)
  })

  it('flags dashed table separator steps', () => {
    const issues = auditRecipe({
      ...base,
      steps: [{ title: 'Step 1', content: '---- | ---- | ----' }]
    })
    expect(issues.some((i) => i.code === 'dashed-step')).toBe(true)
  })

  it('flags jammed ingredient names', () => {
    const issues = auditRecipe({
      ...base,
      ingredients: [
        {
          ingredientName: 'vegetable oil 3 sprigs of curry leaves (about',
          amount: '4',
          unit: 'tbsp',
          notes: ''
        }
      ]
    })
    expect(issues.some((i) => i.code === 'jammed-ingredient')).toBe(true)
  })

  it('flags flavor tags parsed as steps', () => {
    const issues = auditRecipe({
      ...base,
      steps: [{ title: 'Step 1', content: 'slightly spicy' }]
    })
    expect(issues.some((i) => i.code === 'flavor-tag-step')).toBe(true)
  })

  it('flags missing source', () => {
    const issues = auditRecipe({ ...base, source: '' })
    expect(issues.some((i) => i.code === 'missing-source')).toBe(true)
  })

  it('warns but passes when estimatedMinutes is missing', () => {
    const issues = auditRecipe(base)
    expect(issues.some((i) => i.code === 'missing-estimated-minutes')).toBe(true)
    expect(auditPassed(issues)).toBe(true)
  })

  it('does not warn when estimatedMinutes is set', () => {
    const issues = auditRecipe({ ...base, estimatedMinutes: 45 })
    expect(issues.some((i) => i.code === 'missing-estimated-minutes')).toBe(false)
  })
})
