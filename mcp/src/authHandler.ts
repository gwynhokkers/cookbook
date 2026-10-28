import {
  AuthorizationError,
  CimdFetchError,
  authorizationErrorRedirect,
  type ConsentDescription,
  type OAuthHelpers
} from '@cloudflare/workers-oauth-provider'
import type { CookbookDb } from '../../server/domain/recipes/types'
import type { OAuthProfile } from '../../server/utils/oauthLoginDecision'
import type { OAuthWorkerEnv } from './oauthWorker'
import { resolveProviderLogin } from './providerLogin'
import { scopeDescriptions, scopeRoles, scopesToGrant, type Scope } from './scopes'
import type { GrantProps } from './signedInUser'

type Provider = OAuthProfile['provider']

/** An identity provider users sign in with. Each one returns to `/callback`. */
type Upstream = {
  label: string
  authorizeUrl: string
  scope: string
  clientId: (env: OAuthWorkerEnv) => string | undefined
  fetchProfile: (env: OAuthWorkerEnv, code: string, verifier: string) => Promise<OAuthProfile>
}

const callbackUrl = (env: OAuthWorkerEnv) => `${env.MCP_ORIGIN}/callback`

async function fetchGithubProfile(env: OAuthWorkerEnv, code: string, verifier: string): Promise<OAuthProfile> {
  const userAgent = `cookbook-mcp (${env.MCP_ORIGIN})`
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': userAgent },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl(env),
      code_verifier: verifier
    })
  })
  const token = await tokenResponse.json() as { access_token?: string, error?: string }
  if (!token.access_token) throw new Error(`GitHub token exchange failed: ${token.error ?? tokenResponse.status}`)

  const userResponse = await fetch('https://api.github.com/user', {
    headers: { 'Authorization': `Bearer ${token.access_token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': userAgent }
  })
  if (!userResponse.ok) throw new Error(`GitHub user lookup failed: ${userResponse.status}`)
  const user = await userResponse.json() as { id: number, login: string, name: string | null, email: string | null, avatar_url: string | null }
  return { provider: 'github', providerId: String(user.id), email: user.email ?? '', name: user.name || user.login, image: user.avatar_url }
}

async function fetchGoogleProfile(env: OAuthWorkerEnv, code: string, verifier: string): Promise<OAuthProfile> {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      code,
      redirect_uri: callbackUrl(env),
      grant_type: 'authorization_code',
      code_verifier: verifier
    })
  })
  const token = await tokenResponse.json() as { access_token?: string, error?: string }
  if (!token.access_token) throw new Error(`Google token exchange failed: ${token.error ?? tokenResponse.status}`)

  // The web app stores this endpoint's `id` as users.googleId.
  const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` }
  })
  if (!userResponse.ok) throw new Error(`Google user lookup failed: ${userResponse.status}`)
  const user = await userResponse.json() as { id: string, email?: string, name?: string, picture?: string }
  const email = user.email ?? ''
  return { provider: 'google', providerId: user.id, email, name: user.name || email.split('@')[0] || '', image: user.picture ?? null }
}

const upstreams: Record<Provider, Upstream> = {
  github: {
    label: 'GitHub',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    scope: 'read:user',
    clientId: env => env.GITHUB_CLIENT_ID,
    fetchProfile: fetchGithubProfile
  },
  google: {
    label: 'Google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scope: 'openid email profile',
    clientId: env => env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? env.GOOGLE_CLIENT_ID : undefined,
    fetchProfile: fetchGoogleProfile
  }
}

function availableProviders(env: OAuthWorkerEnv) {
  return (Object.keys(upstreams) as Provider[]).filter(provider => upstreams[provider].clientId(env))
}

const escape = (value: string) => value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`)

function consentPage(details: ConsentDescription, handle: string, scopes: Scope[], providers: Provider[]) {
  const name = escape(details.clientName)
  const publisher = details.clientDomain
    ? `Published by <strong>${escape(details.clientDomain)}</strong>.`
    : 'This app registered itself, so its name is not verified.'
  const loopbackWarning = details.redirectIsLoopback
    ? '<p><strong>This sends access to an app on your computer.</strong> Continue only if you just started connecting from it.</p>'
    : ''
  const scopeList = scopes.map((scope) => {
    const editorsOnly = scopeRoles[scope].includes('viewer') ? '' : ' (editors and admins only)'
    return `  <li>${scopeDescriptions[scope]}${editorsOnly} <code>${scope}</code></li>`
  }).join('\n')
  const signInButtons = providers
    .map(provider => `  <button name="provider" value="${provider}">Allow and sign in with ${upstreams[provider].label}</button>`)
    .join('\n')
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect ${name} to Humboldt Kitchen</title>
<h1>Allow ${name} to use your Humboldt Kitchen cookbook?</h1>
<p>${publisher} Access will be sent to <strong>${escape(details.redirectHost)}</strong>.</p>
${loopbackWarning}
<p>It will be able to:</p>
<ul>
${scopeList}
</ul>
<p>Only existing cookbook accounts can connect.</p>
<form method="post">
  <input type="hidden" name="handle" value="${escape(handle)}">
${signInButtons}
  <button name="decision" value="deny">Deny</button>
</form>`
}

function textResponse(message: string, status: number) {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

function redirect(location: string, headers = new Headers()) {
  headers.set('Location', location)
  return new Response(null, { status: 302, headers })
}

async function base64UrlSha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function showConsent(oauth: OAuthHelpers, request: Request, env: OAuthWorkerEnv) {
  const authRequest = await oauth.parseAuthRequest(request)
  const details = await oauth.describeConsent(authRequest)
  const consent = await oauth.beginConsent(authRequest)
  consent.headers.set('Content-Type', 'text/html; charset=utf-8')
  const page = consentPage(details, consent.handle, scopesToGrant(authRequest.scope), availableProviders(env))
  return new Response(page, { headers: consent.headers })
}

async function answerConsent(oauth: OAuthHelpers, request: Request, env: OAuthWorkerEnv) {
  const form = await request.formData()
  const handle = String(form.get('handle') ?? '')
  const provider = availableProviders(env).find(available => available === form.get('provider'))
  if (form.get('decision') === 'deny' || !provider) {
    const denied = await oauth.denyConsent(request, handle)
    return new Response(null, { status: 302, headers: denied.headers })
  }
  const upstream = upstreams[provider]
  const approved = await oauth.approveConsent(request, handle)
  const verifier = crypto.randomUUID() + crypto.randomUUID()
  const { state, headers } = await oauth.beginUpstream(approved.request, { data: { verifier, provider }, headers: approved.headers })
  const authorize = new URL(upstream.authorizeUrl)
  authorize.search = new URLSearchParams({
    client_id: upstream.clientId(env)!,
    redirect_uri: callbackUrl(env),
    response_type: 'code',
    scope: upstream.scope,
    state,
    code_challenge: await base64UrlSha256(verifier),
    code_challenge_method: 'S256'
  }).toString()
  return redirect(authorize.href, headers)
}

async function finishSignIn(oauth: OAuthHelpers, request: Request, env: OAuthWorkerEnv, db: CookbookDb) {
  const { request: original, data, headers } = await oauth.finishUpstream<{ verifier: string, provider: Provider }>(request)
  const upstream = upstreams[data.provider]
  const code = new URL(request.url).searchParams.get('code')
  if (!code) return redirect(authorizationErrorRedirect(original, 'access_denied'), headers)

  let profile: OAuthProfile
  try {
    profile = await upstream.fetchProfile(env, code, data.verifier)
  } catch (error) {
    console.error(`[mcp/callback] ${upstream.label} sign-in failed:`, error instanceof Error ? error.message : error)
    return redirect(authorizationErrorRedirect(original, 'server_error', `${upstream.label} sign-in failed`), headers)
  }

  const login = await resolveProviderLogin(db, profile)
  if (login.kind === 'reject') {
    return redirect(authorizationErrorRedirect(original, 'access_denied', `This ${upstream.label} account has no Humboldt Kitchen cookbook account`), headers)
  }

  const scopes = scopesToGrant(original.scope)
  const props: GrantProps = { userId: login.userId, scopes }
  const { redirectTo } = await oauth.completeAuthorization({
    request: original,
    userId: login.userId,
    metadata: {},
    scope: scopes,
    props
  })
  return redirect(redirectTo, headers)
}

export function createAuthHandler<Env extends OAuthWorkerEnv>(getDb: (env: Env) => CookbookDb) {
  return {
    async fetch(request: Request, env: Env) {
      const oauth = env.OAUTH_PROVIDER!
      const { pathname } = new URL(request.url)
      try {
        if (pathname === '/authorize' && request.method === 'GET') return await showConsent(oauth, request, env)
        if (pathname === '/authorize' && request.method === 'POST') return await answerConsent(oauth, request, env)
        if (pathname === '/callback' && request.method === 'GET') return await finishSignIn(oauth, request, env, getDb(env))
        return textResponse('Not Found', 404)
      } catch (error) {
        if (error instanceof AuthorizationError && error.redirectTo) return redirect(error.redirectTo)
        if (error instanceof AuthorizationError) return textResponse(error.description, 400)
        if (error instanceof CimdFetchError) return textResponse('This app could not be verified.', 400)
        throw error
      }
    }
  }
}
