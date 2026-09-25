import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { recipes } from '~~/server/db/schema'

describe('recipes schema sourceUrl', () => {
  it('includes nullable source_url alongside source', () => {
    const columns = getTableColumns(recipes)
    expect(columns.source).toBeDefined()
    expect(columns.sourceUrl).toBeDefined()
    expect(columns.sourceUrl.name).toBe('source_url')
  })
})
