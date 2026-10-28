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

function stubGoogle(user: { id: string, email: string }) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url === 'https://oauth2.googleapis.com/token') {
      return Response.json({ access_token: 'google-token', token_type: 'Bearer' })
    }
    if (url === 'https://www.googleapis.com/oauth2/v2/userinfo') {
      return Response.json({ ...user, verified_email: true, name: 'Cook', picture: null })
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

describe('MCP OAuth flow: consent, scopes and GitHub or Google sign-in', () => {
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

  async function openConsent(scope?: string) {
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
      resource: `${MCP_ORIGIN}/mcp`,
      ...(scope ? { scope } : {})
    })}`)
    expect(consentPage.status).toBe(200)
    const html = await consentPage.text()
    expect(html).toContain('Test agent')
    const handle = html.match(/name="handle" value="([^"]+)"/)![1]!
    return { clientId, verifier, html, handle }
  }

  const upstreamAuthorizeUrl = {
    github: 'https://github.com/login/oauth/authorize',
    google: 'https://accounts.google.com/o/oauth2/v2/auth'
  }

  async function signIn(provider: 'github' | 'google', scope?: string) {
    const { clientId, verifier, handle } = await openConsent(scope)

    const toUpstream = await send('/authorize', form({ handle, decision: 'approve', provider }))
    expect(toUpstream.status).toBe(302)
    const upstreamUrl = new URL(toUpstream.headers.get('location')!)
    expect(upstreamUrl.origin + upstreamUrl.pathname).toBe(upstreamAuthorizeUrl[provider])
    expect(upstreamUrl.searchParams.get('redirect_uri')).toBe(`${MCP_ORIGIN}/callback`)

    const callback = await send(`/callback?${new URLSearchParams({ code: 'upstream-code', state: upstreamUrl.searchParams.get('state')! })}`)
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
      GITHUB_CLIENT_SECRET: 'gh-secret',
      GOOGLE_CLIENT_ID: 'google-client',
      GOOGLE_CLIENT_SECRET: 'google-secret'
    }
    await seedRecipe(db, { id: 'secret', title: 'Family curry', visibility: 'private' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lets an existing GitHub user connect, read a private recipe and refresh the token', async () => {
    await seedUser(db, { id: 'u1', email: 'cook@example.com', githubId: '4242' })
    stubGithub({ id: 4242, login: 'cook' })

    const { clientId, verifier, redirect } = await signIn('github')
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

  it('refuses get_recipe with a clear error when the connection was not granted recipes:read', async () => {
    await seedUser(db, { id: 'u1', email: 'cook@example.com', githubId: '4242' })
    stubGithub({ id: 4242, login: 'cook' })

    const { clientId, verifier, redirect } = await signIn('github', 'shopping:read')
    const tokens = await exchange({
      grant_type: 'authorization_code',
      code: redirect.searchParams.get('code')!,
      redirect_uri: CLIENT_REDIRECT,
      client_id: clientId,
      code_verifier: verifier
    })
    const { json } = await getRecipe(tokens.access_token, 'secret')

    expect(json.result.isError).toBe(true)
    expect(json.result.content[0].text).toContain('recipes:read')
    expect(json.result.structuredContent).toBeUndefined()
  })

  it('turns away a GitHub user with no cookbook account and creates no user', async () => {
    stubGithub({ id: 9999, login: 'stranger' })

    const { redirect } = await signIn('github')

    expect(redirect.origin + redirect.pathname).toBe(CLIENT_REDIRECT)
    expect(redirect.searchParams.get('error')).toBe('access_denied')
    expect(redirect.searchParams.get('code')).toBeNull()
    expect(await db.select().from(schema.users)).toEqual([])
  })

  it('offers recipes:read on the consent page when the client asks for no scopes', async () => {
    const { html } = await openConsent()

    expect(html).toContain('recipes:read')
    expect(html).not.toContain('shopping:read')
  })

  it('lists the scopes the client asks for on the consent page, ignoring unknown ones', async () => {
    const { html } = await openConsent('shopping:read recipes:write openid')

    expect(html).toContain('shopping:read')
    expect(html).toContain('recipes:write')
    expect(html).not.toContain('openid')
    expect(html).not.toContain('recipes:read')
  })

  it('lets an existing Google user connect and read a private recipe', async () => {
    await seedUser(db, { id: 'u1', email: 'cook@example.com' })
    await db.update(schema.users).set({ googleId: 'g-77' })
    stubGoogle({ id: 'g-77', email: 'cook@example.com' })

    const { clientId, verifier, redirect } = await signIn('google')
    expect(redirect.searchParams.get('error')).toBeNull()
    const tokens = await exchange({
      grant_type: 'authorization_code',
      code: redirect.searchParams.get('code')!,
      redirect_uri: CLIENT_REDIRECT,
      client_id: clientId,
      code_verifier: verifier
    })

    const { json } = await getRecipe(tokens.access_token, 'secret')
    expect(json.result.structuredContent).toMatchObject({ id: 'secret', title: 'Family curry' })
  })

  it('turns away a Google user who matches only by email and creates no user', async () => {
    await seedUser(db, { id: 'u1', email: 'cook@example.com' })
    stubGoogle({ id: 'g-unknown', email: 'cook@example.com' })

    const { redirect } = await signIn('google')

    expect(redirect.searchParams.get('error')).toBe('access_denied')
    expect(redirect.searchParams.get('code')).toBeNull()
    expect(await db.select({ id: schema.users.id, googleId: schema.users.googleId }).from(schema.users)).toEqual([{ id: 'u1', googleId: null }])
  })

  it('sends the client a server_error when Google sign-in fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'invalid_grant' }, { status: 400 })))

    const { redirect } = await signIn('google')

    expect(redirect.origin + redirect.pathname).toBe(CLIENT_REDIRECT)
    expect(redirect.searchParams.get('error')).toBe('server_error')
    expect(redirect.searchParams.get('state')).toBe('client-state')
  })

  it('sends the client access_denied when the user denies consent', async () => {
    const { handle } = await openConsent()

    const denied = await send('/authorize', form({ handle, decision: 'deny' }))

    expect(denied.status).toBe(302)
    const redirect = new URL(denied.headers.get('location')!)
    expect(redirect.origin + redirect.pathname).toBe(CLIENT_REDIRECT)
    expect(redirect.searchParams.get('error')).toBe('access_denied')
  })

  it('sends the client a server_error when GitHub sign-in fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'bad_verification_code' })))

    const { redirect } = await signIn('github')

    expect(redirect.origin + redirect.pathname).toBe(CLIENT_REDIRECT)
    expect(redirect.searchParams.get('error')).toBe('server_error')
    expect(redirect.searchParams.get('state')).toBe('client-state')
  })
})
