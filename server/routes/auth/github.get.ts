// setUserSession is auto-imported by nuxt-auth-utils
import { db, schema } from '../../db'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export default defineEventHandler(async (event) => {
  // Get the code from query params (GitHub OAuth callback)
  const query = getQuery(event)
  const code = query.code as string

  const config = useRuntimeConfig(event)
  const clientId = config.oauth?.github?.clientId || process.env.GITHUB_CLIENT_ID
  const clientSecret = config.oauth?.github?.clientSecret || process.env.GITHUB_CLIENT_SECRET

  if (!code) {
    // Redirect to GitHub OAuth
    if (!clientId) {
      throw createError({
        statusCode: 500,
        statusMessage: 'GitHub OAuth not configured'
      })
    }

    const redirectUri = `${getRequestURL(event).origin}/auth/github`
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:email`

    return sendRedirect(event, githubAuthUrl)
  }

  // Exchange code for access token
  if (!clientId || !clientSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'GitHub OAuth not configured'
    })
  }

  const origin = getRequestURL(event).origin
  const redirectUri = `${origin}/auth/github`
  const userAgent = `MegwynCookbook (${origin})`

  // #region agent log
  let lastStep = 'start'
  fetch('http://127.0.0.1:7244/ingest/836a5a53-c1a4-4537-b667-aa0ce7fbd95c', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'e00b61' }, body: JSON.stringify({ sessionId: 'e00b61', runId: 'auth', hypothesisId: 'H1', location: 'auth/github.get.ts:entry', message: 'auth callback', data: { hasCode: !!code, hasClientId: !!clientId, hasClientSecret: !!clientSecret, redirectUri }, timestamp: Date.now() }) }).catch(() => {})
  // #endregion

  try {
    lastStep = 'token_exchange'
    // Exchange code for access token (GitHub requires User-Agent)
    const tokenResponse = await $fetch<{ access_token?: string; error?: string; error_description?: string }>('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': userAgent
      },
      body: {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri
      }
    })

    if (tokenResponse.error) {
      console.error('[auth/github] GitHub token error:', tokenResponse.error, tokenResponse.error_description, 'redirect_uri=', redirectUri)
      throw createError({ statusCode: 400, statusMessage: `GitHub: ${tokenResponse.error_description || tokenResponse.error}. Check that the Authorization callback URL in your GitHub OAuth app is exactly: ${redirectUri}` })
    }
    const accessToken = tokenResponse.access_token
    if (!accessToken) {
      console.error('[auth/github] No access_token in response:', typeof tokenResponse)
      throw createError({ statusCode: 500, statusMessage: 'GitHub did not return an access token' })
    }

    lastStep = 'user_fetch'
    // Get user info from GitHub (User-Agent required by GitHub API)
    const userResponse = await $fetch<{
      id: number
      login: string
      name: string
      email: string
      avatar_url: string
    }>('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': userAgent
      }
    })

    // Get user email (might need to fetch from emails endpoint)
    let email = userResponse.email
    if (!email) {
      const emails = await $fetch<Array<{ email: string; primary: boolean }>>('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': userAgent
        }
      })
      const primaryEmail = emails.find(e => e.primary)
      email = primaryEmail?.email || emails[0]?.email || ''
    }

    // Determine if this GitHub user should be auto-promoted to admin
    const config = useRuntimeConfig(event)
    const adminGithubIds = (config.adminGithubIds || '').split(',').map((s: string) => s.trim()).filter(Boolean)

    lastStep = 'db'
    // Find or create user in database
    const githubId = userResponse.id.toString()
    let user = await db.select().from(schema.users)
      .where(eq(schema.users.githubId, githubId))
      .limit(1)
      .then(rows => rows[0])

    if (!user) {
      // Check if user exists by email
      user = await db.select().from(schema.users)
        .where(eq(schema.users.email, email))
        .limit(1)
        .then(rows => rows[0])

      const assignedRole = adminGithubIds.includes(githubId) ? 'admin' : 'viewer'

      if (user) {
        // Update existing user with GitHub ID
        await db.update(schema.users)
          .set({
            githubId,
            image: userResponse.avatar_url,
            role: assignedRole,
            updatedAt: new Date()
          })
          .where(eq(schema.users.id, user.id))
        user = { ...user, githubId, image: userResponse.avatar_url, role: assignedRole }
      } else {
        // Create new user
        const userId = nanoid()
        await db.insert(schema.users).values({
          id: userId,
          name: userResponse.name || userResponse.login,
          email,
          githubId,
          image: userResponse.avatar_url,
          emailVerified: true,
          role: assignedRole
        })
        user = await db.select().from(schema.users)
          .where(eq(schema.users.id, userId))
          .limit(1)
          .then(rows => rows[0])!
      }
    } else {
      // Update user info; auto-promote to admin if in the list
      const roleUpdate = adminGithubIds.includes(githubId) ? 'admin' : user.role
      await db.update(schema.users)
        .set({
          name: userResponse.name || userResponse.login,
          email,
          image: userResponse.avatar_url,
          role: roleUpdate,
          updatedAt: new Date()
        })
        .where(eq(schema.users.id, user.id))
      user = { ...user, name: userResponse.name || userResponse.login, email, image: userResponse.avatar_url, role: roleUpdate }
    }

    lastStep = 'session'
    // Set user session (include role for frontend and API checks)
    await setUserSession(event, {
      user: {
        id: user.id,
        name: user.name || userResponse.login,
        email: user.email,
        image: user.image,
        role: user.role
      }
    })

    // Redirect to home
    return sendRedirect(event, '/')
  } catch (error: unknown) {
    const err = error as { message?: string; statusCode?: number; data?: unknown }
    console.error('[auth/github] OAuth error', { lastStep, message: err?.message, statusCode: err?.statusCode, data: err?.data })
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/836a5a53-c1a4-4537-b667-aa0ce7fbd95c', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'e00b61' }, body: JSON.stringify({ sessionId: 'e00b61', runId: 'auth', hypothesisId: 'H2-H5', location: 'auth/github.get.ts:catch', message: 'auth failed', data: { lastStep, errorMessage: err?.message }, timestamp: Date.now() }) }).catch(() => {})
    // #endregion
    if (err?.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      throw error
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to authenticate with GitHub'
    })
  }
})
