import { eq } from 'drizzle-orm'
import * as schema from '../../server/db/schema'
import { decideOAuthLogin } from '../../server/utils/oauthLoginDecision'
import type { CookbookDb } from '../../server/domain/recipes/types'

export type GithubProfile = {
  githubId: string
  email: string
  name: string
  image: string | null
}

export type GithubLoginResult = { kind: 'sign-in', userId: string } | { kind: 'reject' }

// Invite-only: with no invite and no env-admin override, the app's own rule never creates a user.
export async function resolveGithubLogin(db: CookbookDb, profile: GithubProfile): Promise<GithubLoginResult> {
  const [existing] = await db.select()
    .from(schema.users)
    .where(eq(schema.users.githubId, profile.githubId))
    .limit(1)

  const decision = decideOAuthLogin({
    profile: { provider: 'github', providerId: profile.githubId, email: profile.email, name: profile.name, image: profile.image },
    existing: existing ?? null,
    invite: null,
    isEnvAdmin: false
  })

  return decision.kind === 'sign-in' ? { kind: 'sign-in', userId: decision.userId } : { kind: 'reject' }
}
