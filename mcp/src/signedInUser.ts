import { eq } from 'drizzle-orm'
import * as schema from '../../server/db/schema'
import type { CookbookDb } from '../../server/domain/recipes/types'
import { grantedScopes, type Scope } from './scopes'

/** What an OAuth grant stores. The role is deliberately absent: it is read from D1 on every request. */
export type GrantProps = { userId: string, scopes: Scope[] }

/** The user behind a request, with the scopes their connection was granted. */
export type SignedInUser = { id: string, role: string, scopes: Scope[] }

export async function findSignedInUser(db: CookbookDb, props: Partial<GrantProps> | undefined): Promise<SignedInUser | null> {
  const userId = props?.userId
  if (typeof userId !== 'string') return null
  const [user] = await db.select({ id: schema.users.id, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)
  return user ? { ...user, scopes: grantedScopes(props?.scopes) } : null
}
