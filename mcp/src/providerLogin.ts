import { eq } from 'drizzle-orm'
import * as schema from '../../server/db/schema'
import { decideOAuthLogin, type OAuthProfile } from '../../server/utils/oauthLoginDecision'
import type { CookbookDb } from '../../server/domain/recipes/types'

export type ProviderLoginResult = { kind: 'sign-in', userId: string } | { kind: 'reject' }

// Invite-only: with no invite and no env-admin override, the app's own rule never creates a user.
export async function resolveProviderLogin(db: CookbookDb, profile: OAuthProfile): Promise<ProviderLoginResult> {
  const idColumn = profile.provider === 'github' ? schema.users.githubId : schema.users.googleId
  const [existing] = await db.select()
    .from(schema.users)
    .where(eq(idColumn, profile.providerId))
    .limit(1)

  const decision = decideOAuthLogin({
    profile,
    existing: existing ?? null,
    invite: null,
    isEnvAdmin: false
  })

  return decision.kind === 'sign-in' ? { kind: 'sign-in', userId: decision.userId } : { kind: 'reject' }
}
