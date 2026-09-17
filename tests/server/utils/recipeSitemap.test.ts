import { describe, expect, it } from 'vitest'
import {
  loadPublicRecipeSitemapUrls,
  publicRecipeSitemapUrls
} from '~~/server/utils/recipeSitemap'

describe('publicRecipeSitemapUrls', () => {
  it('keeps public recipes and drops private ones', () => {
    const urls = publicRecipeSitemapUrls([
      { id: 'mapo-tofu', visibility: 'public', updatedAt: new Date('2026-01-02T03:04:05.000Z') },
      { id: 'secret-cake', visibility: 'private', updatedAt: new Date('2026-02-03T04:05:06.000Z') }
    ])

    expect(urls).toEqual([
      { loc: '/recipes/mapo-tofu', lastmod: '2026-01-02T03:04:05.000Z' }
    ])
  })

  it('omits lastmod when updatedAt is missing', () => {
    expect(publicRecipeSitemapUrls([
      { id: 'no-date', visibility: 'public', updatedAt: null }
    ])).toEqual([{ loc: '/recipes/no-date' }])
  })
})

describe('loadPublicRecipeSitemapUrls', () => {
  it('returns an empty list when the query throws', async () => {
    await expect(loadPublicRecipeSitemapUrls(async () => {
      throw new Error('db down')
    })).resolves.toEqual([])
  })
})
