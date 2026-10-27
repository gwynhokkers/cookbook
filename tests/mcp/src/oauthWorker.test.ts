import { beforeEach, describe, expect, it } from 'vitest'
import { createOAuthWorker } from '~~/mcp/src/oauthWorker'
import { createMemoryKv } from '../memoryKv'
import { createTestDb, type TestDb } from '../testDb'

const MCP_ORIGIN = 'http://localhost:8787'
const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext

describe('OAuth-protected MCP Worker', () => {
  let db: TestDb
  let env: Parameters<ReturnType<typeof createOAuthWorker>['fetch']>[1]

  beforeEach(() => {
    db = createTestDb()
    env = {
      APP_ORIGIN: 'https://cookbook.example',
      MCP_ORIGIN,
      OAUTH_KV: createMemoryKv(),
      GITHUB_CLIENT_ID: 'gh-client',
      GITHUB_CLIENT_SECRET: 'gh-secret'
    }
  })

  it('rejects an unauthenticated /mcp request with a challenge pointing at the resource metadata', async () => {
    const worker = createOAuthWorker(() => db)

    const response = await worker.fetch(new Request(`${MCP_ORIGIN}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
    }), env, ctx)

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain(
      `resource_metadata="${MCP_ORIGIN}/.well-known/oauth-protected-resource/mcp"`
    )
  })
})
