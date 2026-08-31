import { describe, expect, it } from 'vitest'
import { collectDistinctSources, collectDistinctTags } from '~~/server/utils/recipeFacets'

describe('recipeFacets', () => {
  const rows = [
    { tags: ['curry', 'vegan'], source: 'Book A' },
    { tags: ['thai', 'vegetarian'], source: 'Book B' },
    { tags: ['curry'], source: 'Book A' }
  ]

  it('collects distinct non-diet tags', () => {
    expect(collectDistinctTags(rows, '').sort()).toEqual(['curry', 'thai'])
  })

  it('filters tags by prefix', () => {
    expect(collectDistinctTags(rows, 'cu')).toEqual(['curry'])
  })

  it('collects distinct sources with substring filter', () => {
    expect(collectDistinctSources(rows, 'book a')).toEqual(['Book A'])
  })
})
