import { OAuthProvider, type OAuthHelpers } from '@cloudflare/workers-oauth-provider'
import { createAuthHandler } from './authHandler'
import type { CookbookDb } from './getRecipe'
import { createWorker } from './worker'

export interface OAuthWorkerEnv {
  APP_ORIGIN: string
  MCP_ORIGIN: string
  OAUTH_KV: KVNamespace
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  OAUTH_PROVIDER?: OAuthHelpers
}

export function createOAuthWorker<Env extends OAuthWorkerEnv>(getDb: (env: Env) => CookbookDb) {
  let provider: OAuthProvider<Env> | undefined

  // The resource URL is fixed at construction, and MCP_ORIGIN is only known once env arrives.
  function providerFor(origin: string) {
    provider ??= new OAuthProvider<Env>({
      apiRoute: '/mcp',
      apiHandler: createWorker(getDb),
      defaultHandler: createAuthHandler(getDb),
      authorizeEndpoint: '/authorize',
      tokenEndpoint: '/token',
      clientRegistrationEndpoint: '/register',
      resourceMetadata: {
        resource: `${origin}/mcp`,
        authorization_servers: [origin],
        resource_name: 'Humboldt Kitchen cookbook'
      }
    })
    return provider
  }

  return {
    fetch(request: Request, env: Env, ctx: ExecutionContext) {
      return providerFor(env.MCP_ORIGIN).fetch(request, env, ctx)
    }
  }
}
