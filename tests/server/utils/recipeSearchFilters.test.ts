import { describe, expect, it } from 'vitest'
import { recipeMatchesTagFilter } from '~~/shared/utils/recipeSearchFilters'

describe('recipeMatchesTagFilter', () => {
  it('matches any selected tag (OR)', () => {
    expect(recipeMatchesTagFilter(['curry', 'indian'], ['thai', 'curry'])).toBe(true)
    expect(recipeMatchesTagFilter(['indian'], ['thai', 'curry'])).toBe(false)
  })

  it('passes when no filter tags', () => {
    expect(recipeMatchesTagFilter(['curry'], [])).toBe(true)
  })
})
