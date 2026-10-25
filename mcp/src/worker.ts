import { createMcpHandler } from 'agents/mcp/server'
import type { CookbookDb } from './getPublicRecipe'
import { createCookbookMcpServer } from './server'

export function createWorker<Env extends { APP_ORIGIN: string }>(getDb: (env: Env) => CookbookDb) {
  return {
    fetch(request: Request, env: Env, ctx: ExecutionContext) {
      const db = getDb(env)
      return createMcpHandler(() => createCookbookMcpServer(db, env.APP_ORIGIN))(request, env, ctx)
    }
  }
}
