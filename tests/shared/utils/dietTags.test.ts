import { describe, expect, it } from 'vitest'
import { applyDietTagSelection, isDietTag, normalizeDietTags } from '~~/shared/utils/dietTags'

describe('dietTags', () => {
  it('identifies diet tags', () => {
    expect(isDietTag('vegan')).toBe(true)
    expect(isDietTag('curry')).toBe(false)
  })

  it('normalizes diet tags', () => {
    expect(normalizeDietTags(['Vegan', 'vegan', 'curry'])).toEqual(['vegan'])
  })

  it('replaces diet tags when toggles change', () => {
    expect(applyDietTagSelection(['curry', 'vegetarian'], ['vegan'])).toEqual(['curry', 'vegan'])
  })
})
