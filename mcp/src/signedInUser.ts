import { eq } from 'drizzle-orm'
import * as schema from '../../server/db/schema'
import type { CookbookDb } from '../../server/domain/recipes/types'

/** What an OAuth grant stores. The role is deliberately absent: it is read from D1 on every request. */
export type GrantProps = { userId: string }

export type SignedInUser = { id: string, role: string }

export async function findSignedInUser(db: CookbookDb, props: Partial<GrantProps> | undefined): Promise<SignedInUser | null> {
  const userId = props?.userId
  if (typeof userId !== 'string') return null
  const [user] = await db.select({ id: schema.users.id, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)
  return user ?? null
}
