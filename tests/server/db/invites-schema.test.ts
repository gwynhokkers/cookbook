import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { invites } from '~~/server/db/schema'

describe('invites schema', () => {
  it('stores a unique token hash, role, and spend timestamps', () => {
    const columns = getTableColumns(invites)
    expect(Object.keys(columns).sort()).toEqual([
      'createdAt',
      'createdBy',
      'expiresAt',
      'id',
      'revokedAt',
      'role',
      'tokenHash',
      'usedAt'
    ])
  })
})
