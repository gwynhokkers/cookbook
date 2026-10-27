import {
  AuthorizationError,
  CimdFetchError,
  authorizationErrorRedirect,
  type ConsentDescription,
  type OAuthHelpers
} from '@cloudflare/workers-oauth-provider'
import type { CookbookDb } from './getRecipe'
import { resolveGithubLogin, type GithubProfile } from './githubLogin'
import type { OAuthWorkerEnv } from './oauthWorker'
import type { GrantProps } from './signedInUser'

const githubCallbackUrl = (env: OAuthWorkerEnv) => `${env.MCP_ORIGIN}/callback`

const escape = (value: string) => value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`)

function consentPage(details: ConsentDescription, handle: string) {
  const name = escape(details.clientName)
  const publisher = details.clientDomain
    ? `Published by <strong>${escape(details.clientDomain)}</strong>.`
    : 'This app registered itself, so its name is not verified.'
  const loopbackWarning = details.redirectIsLoopback
    ? '<p><strong>This sends access to an app on your computer.</strong> Continue only if you just started connecting from it.</p>'
    : ''
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect ${name} to Humboldt Kitchen</title>
<h1>Allow ${name} to read your Humboldt Kitchen cookbook?</h1>
<p>${publisher} Access will be sent to <strong>${escape(details.redirectHost)}</strong>.</p>
${loopbackWarning}
<p>You'll sign in with GitHub next. Only existing cookbook accounts can connect.</p>
<form method="post">
  <input type="hidden" name="handle" value="${escape(handle)}">
  <button name="decision" value="approve">Allow</button>
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

async function fetchGithubProfile(env: OAuthWorkerEnv, code: string, verifier: string): Promise<GithubProfile> {
  const userAgent = `cookbook-mcp (${env.MCP_ORIGIN})`
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': userAgent },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: githubCallbackUrl(env),
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
  return { githubId: String(user.id), email: user.email ?? '', name: user.name || user.login, image: user.avatar_url }
}

async function showConsent(oauth: OAuthHelpers, request: Request) {
  const authRequest = await oauth.parseAuthRequest(request)
  const details = await oauth.describeConsent(authRequest)
  const consent = await oauth.beginConsent(authRequest)
  consent.headers.set('Content-Type', 'text/html; charset=utf-8')
  return new Response(consentPage(details, consent.handle), { headers: consent.headers })
}

async function answerConsent(oauth: OAuthHelpers, request: Request, env: OAuthWorkerEnv) {
  const form = await request.formData()
  const handle = String(form.get('handle') ?? '')
  if (form.get('decision') !== 'approve') {
    const denied = await oauth.denyConsent(request, handle)
    return new Response(null, { status: 302, headers: denied.headers })
  }
  const approved = await oauth.approveConsent(request, handle)
  const verifier = crypto.randomUUID() + crypto.randomUUID()
  const { state, headers } = await oauth.beginUpstream(approved.request, { data: { verifier }, headers: approved.headers })
  const github = new URL('https://github.com/login/oauth/authorize')
  github.search = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: githubCallbackUrl(env),
    scope: 'read:user',
    state,
    code_challenge: await base64UrlSha256(verifier),
    code_challenge_method: 'S256'
  }).toString()
  return redirect(github.href, headers)
}

async function finishGithubSignIn(oauth: OAuthHelpers, request: Request, env: OAuthWorkerEnv, db: CookbookDb) {
  const { request: original, data, headers } = await oauth.finishUpstream<{ verifier: string }>(request)
  const code = new URL(request.url).searchParams.get('code')
  if (!code) return redirect(authorizationErrorRedirect(original, 'access_denied'), headers)

  let profile: GithubProfile
  try {
    profile = await fetchGithubProfile(env, code, data.verifier)
  } catch (error) {
    console.error('[mcp/callback] GitHub sign-in failed:', error instanceof Error ? error.message : error)
    return redirect(authorizationErrorRedirect(original, 'server_error', 'GitHub sign-in failed'), headers)
  }

  const login = await resolveGithubLogin(db, profile)
  if (login.kind === 'reject') {
    return redirect(authorizationErrorRedirect(original, 'access_denied', 'This GitHub account has no Humboldt Kitchen cookbook account'), headers)
  }

  const props: GrantProps = { userId: login.userId }
  const { redirectTo } = await oauth.completeAuthorization({
    request: original,
    userId: login.userId,
    metadata: {},
    scope: original.scope,
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
        if (pathname === '/authorize' && request.method === 'GET') return await showConsent(oauth, request)
        if (pathname === '/authorize' && request.method === 'POST') return await answerConsent(oauth, request, env)
        if (pathname === '/callback' && request.method === 'GET') return await finishGithubSignIn(oauth, request, env, getDb(env))
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
