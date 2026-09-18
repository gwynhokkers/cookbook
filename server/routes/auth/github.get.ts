import { completeOAuthLogin } from '../../utils/oauthLogin'

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

  try {
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

    return completeOAuthLogin(event, {
      provider: 'github',
      providerId: userResponse.id.toString(),
      email: email || '',
      name: userResponse.name || userResponse.login,
      image: userResponse.avatar_url,
      emailVerified: true
    })
  } catch (error: unknown) {
    const err = error as { message?: string; statusCode?: number; data?: unknown }
    console.error('[auth/github] OAuth error:', err?.message ?? error)
    if (err?.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      throw error
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to authenticate with GitHub'
    })
  }
})
