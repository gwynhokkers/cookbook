import { createMcpHandler } from 'agents/mcp/server'
import type { CookbookDb } from '../../server/domain/recipes/types'
import { createCookbookMcpServer } from './server'
import { findSignedInUser, type GrantProps } from './signedInUser'

export function createWorker<Env extends { APP_ORIGIN: string }>(getDb: (env: Env) => CookbookDb) {
  return {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
      const db = getDb(env)
      const user = await findSignedInUser(db, ctx.props as Partial<GrantProps> | undefined)
      if (!user) {
        return new Response('Unauthorized', {
          status: 401,
          headers: { 'WWW-Authenticate': 'Bearer error="invalid_token", error_description="The signed-in user no longer exists"' }
        })
      }
      return createMcpHandler(() => createCookbookMcpServer(db, env.APP_ORIGIN, user))(request, env, ctx)
    }
  }
}
