import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '~~/server/db/schema'
import { createOAuthWorker } from '~~/mcp/src/oauthWorker'
import { createMemoryKv } from '../memoryKv'
import { createTestDb, seedRecipe, seedUser, type TestDb } from '../testDb'

const MCP_ORIGIN = 'http://localhost:8787'
const CLIENT_REDIRECT = 'http://localhost:6274/oauth/callback'
const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext

function stubGithub(user: { id: number, login: string }) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url === 'https://github.com/login/oauth/access_token') {
      return Response.json({ access_token: 'gh-token', token_type: 'bearer' })
    }
    if (url === 'https://api.github.com/user') {
      return Response.json({ ...user, name: user.login, email: null, avatar_url: null })
    }
    throw new Error(`Unexpected fetch: ${url}`)
  }))
}

async function pkce() {
  const verifier = 'v'.repeat(43) + crypto.randomUUID()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return { verifier, challenge }
}

describe('MCP OAuth flow with GitHub sign-in', () => {
  let db: TestDb
  let env: Parameters<ReturnType<typeof createOAuthWorker>['fetch']>[1]
  let cookies: Map<string, string>

  function send(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers)
    if (cookies.size) headers.set('cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '))
    return createOAuthWorker(() => db).fetch(new Request(`${MCP_ORIGIN}${path}`, { ...init, headers, redirect: 'manual' }), env, ctx)
      .then((response) => {
        for (const line of response.headers.getSetCookie()) {
          const [pair] = line.split(';')
          const [name, value] = pair!.split('=') as [string, string]
          if (value) cookies.set(name, value)
          else cookies.delete(name)
        }
        return response
      })
  }

  function form(values: Record<string, string>) {
    return { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values).toString() }
  }

  async function signInWithGithub() {
    const registration = await send('/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'Test agent', redirect_uris: [CLIENT_REDIRECT], token_endpoint_auth_method: 'none' })
    })
    expect(registration.status).toBe(201)
    const { client_id: clientId } = await registration.json() as { client_id: string }

    const { verifier, challenge } = await pkce()
    const consentPage = await send(`/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: CLIENT_REDIRECT,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'client-state',
      resource: `${MCP_ORIGIN}/mcp`
    })}`)
    expect(consentPage.status).toBe(200)
    const html = await consentPage.text()
    expect(html).toContain('Test agent')
    const handle = html.match(/name="handle" value="([^"]+)"/)![1]!

    const toGithub = await send('/authorize', form({ handle, decision: 'approve' }))
    expect(toGithub.status).toBe(302)
    const githubUrl = new URL(toGithub.headers.get('location')!)
    expect(githubUrl.origin + githubUrl.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(githubUrl.searchParams.get('redirect_uri')).toBe(`${MCP_ORIGIN}/callback`)

    const callback = await send(`/callback?${new URLSearchParams({ code: 'gh-code', state: githubUrl.searchParams.get('state')! })}`)
    expect(callback.status).toBe(302)
    return { clientId, verifier, redirect: new URL(callback.headers.get('location')!) }
  }

  async function exchange(values: Record<string, string>) {
    const response = await send('/token', form(values))
    expect(response.status).toBe(200)
    return await response.json() as { access_token: string, refresh_token: string }
  }

  async function getRecipe(accessToken: string, recipeId: string) {
    const response = await send('/mcp', {
      method: 'POST',
      headers: {
        'host': 'localhost:8787',
        'authorization': `Bearer ${accessToken}`,
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_recipe', arguments: { recipeId } } })
    })
    const body = await response.text()
    const json = response.headers.get('content-type')?.includes('text/event-stream')
      ? JSON.parse(body.split('\n').filter(line => line.startsWith('data:')).at(-1)!.slice(5))
      : JSON.parse(body)
    return { status: response.status, json }
  }

  beforeEach(async () => {
    db = createTestDb()
    cookies = new Map()
    env = {
      APP_ORIGIN: 'https://cookbook.example',
      MCP_ORIGIN,
      OAUTH_KV: createMemoryKv(),
      GITHUB_CLIENT_ID: 'gh-client',
      GITHUB_CLIENT_SECRET: 'gh-secret'
    }
    await seedRecipe(db, { id: 'secret', title: 'Family curry', visibility: 'private' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lets an existing GitHub user connect, read a private recipe and refresh the token', async () => {
    await seedUser(db, { id: 'u1', email: 'cook@example.com', githubId: '4242' })
    stubGithub({ id: 4242, login: 'cook' })

    const { clientId, verifier, redirect } = await signInWithGithub()
    expect(redirect.origin + redirect.pathname).toBe(CLIENT_REDIRECT)
    expect(redirect.searchParams.get('state')).toBe('client-state')

    const tokens = await exchange({
      grant_type: 'authorization_code',
      code: redirect.searchParams.get('code')!,
      redirect_uri: CLIENT_REDIRECT,
      client_id: clientId,
      code_verifier: verifier
    })
    const first = await getRecipe(tokens.access_token, 'secret')
    expect(first.status).toBe(200)
    expect(first.json.result.structuredContent).toMatchObject({ id: 'secret', title: 'Family curry' })

    const refreshed = await exchange({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId })
    expect(refreshed.access_token).not.toBe(tokens.access_token)
    expect((await getRecipe(refreshed.access_token, 'secret')).status).toBe(200)
  })

  it('turns away a GitHub user with no cookbook account and creates no user', async () => {
    stubGithub({ id: 9999, login: 'stranger' })

    const { redirect } = await signInWithGithub()

    expect(redirect.origin + redirect.pathname).toBe(CLIENT_REDIRECT)
    expect(redirect.searchParams.get('error')).toBe('access_denied')
    expect(redirect.searchParams.get('code')).toBeNull()
    expect(await db.select().from(schema.users)).toEqual([])
  })

  it('sends the client a server_error when GitHub sign-in fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'bad_verification_code' })))

    const { redirect } = await signInWithGithub()

    expect(redirect.origin + redirect.pathname).toBe(CLIENT_REDIRECT)
    expect(redirect.searchParams.get('error')).toBe('server_error')
    expect(redirect.searchParams.get('state')).toBe('client-state')
  })
})
