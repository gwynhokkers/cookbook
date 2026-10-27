import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '~~/server/db/schema'
import { resolveGithubLogin } from '~~/mcp/src/githubLogin'
import { createTestDb, seedUser, type TestDb } from '../testDb'

const profile = { githubId: '4242', email: 'cook@example.com', name: 'Cook', image: null }

describe('resolveGithubLogin', () => {
  let db: TestDb

  beforeEach(() => {
    db = createTestDb()
  })

  it('signs in the existing user with that GitHub id', async () => {
    await seedUser(db, { id: 'u1', email: 'cook@example.com', githubId: '4242', role: 'editor' })

    expect(await resolveGithubLogin(db, profile)).toEqual({ kind: 'sign-in', userId: 'u1' })
  })

  it('rejects an unknown GitHub user and creates no user', async () => {
    expect(await resolveGithubLogin(db, profile)).toEqual({ kind: 'reject' })
    expect(await db.select().from(schema.users)).toEqual([])
  })

  it('rejects a user who matches only by email', async () => {
    await seedUser(db, { id: 'u1', email: 'cook@example.com' })

    expect(await resolveGithubLogin(db, profile)).toEqual({ kind: 'reject' })
  })
})
