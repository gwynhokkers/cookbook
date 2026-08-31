import { describe, expect, it } from 'vitest'
import { parseRecipeSearchFilters, serializeRecipeSearchFilters, clampSearchPage } from '~~/shared/utils/recipeSearchFilters'

describe('parseRecipeSearchFilters', () => {
  it('parses comma-separated params', () => {
    expect(parseRecipeSearchFilters({
      tags: 'curry,thai',
      sources: 'Book A,Book B',
      diet: 'vegan',
      time: 'under-30'
    })).toEqual({
      tags: ['curry', 'thai'],
      sources: ['Book A', 'Book B'],
      diet: ['vegan'],
      time: 'under-30'
    })
  })

  it('ignores invalid diet and time values', () => {
    expect(parseRecipeSearchFilters({ diet: 'keto', time: 'soon' }).diet).toEqual([])
    expect(parseRecipeSearchFilters({ time: 'soon' }).time).toBeNull()
  })
})

describe('serializeRecipeSearchFilters', () => {
  it('round-trips', () => {
    const filters = { tags: ['curry'], sources: [], diet: ['vegan' as const], time: '30-60' as const }
    const query = serializeRecipeSearchFilters(filters)
    expect(parseRecipeSearchFilters(query)).toEqual(filters)
  })
})

describe('clampSearchPage', () => {
  it('clamps page to valid range', () => {
    expect(clampSearchPage(0, 5)).toBe(1)
    expect(clampSearchPage(99, 3)).toBe(3)
    expect(clampSearchPage(2, 3)).toBe(2)
  })
})
