import { completeOAuthLogin } from '../../utils/oauthLogin'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = query.code as string

  const config = useRuntimeConfig(event)
  const clientId = config.oauth?.google?.clientId || process.env.GOOGLE_CLIENT_ID
  const clientSecret = config.oauth?.google?.clientSecret || process.env.GOOGLE_CLIENT_SECRET

  if (!code) {
    if (!clientId) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Google OAuth not configured'
      })
    }

    const redirectUri = `${getRequestURL(event).origin}/auth/google`
    const scope = encodeURIComponent('openid email profile')
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}`

    return sendRedirect(event, googleAuthUrl)
  }

  if (!clientId || !clientSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Google OAuth not configured'
    })
  }

  const origin = getRequestURL(event).origin
  const redirectUri = `${origin}/auth/google`

  try {
    const tokenResponse = await $fetch<{ access_token?: string; error?: string; error_description?: string }>('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      }).toString()
    })

    if (tokenResponse.error) {
      console.error('[auth/google] Google token error:', tokenResponse.error, tokenResponse.error_description, 'redirect_uri=', redirectUri)
      throw createError({
        statusCode: 400,
        statusMessage: `Google: ${tokenResponse.error_description || tokenResponse.error}. Check that the Authorized redirect URI in Google Cloud Console is exactly: ${redirectUri}`
      })
    }

    const accessToken = tokenResponse.access_token
    if (!accessToken) {
      console.error('[auth/google] No access_token in response:', typeof tokenResponse)
      throw createError({ statusCode: 500, statusMessage: 'Google did not return an access token' })
    }

    const userResponse = await $fetch<{
      id: string
      email: string
      verified_email: boolean
      name?: string
      given_name?: string
      family_name?: string
      picture?: string
    }>('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    return completeOAuthLogin(event, {
      provider: 'google',
      providerId: userResponse.id,
      email: userResponse.email || '',
      name: userResponse.name || (userResponse.email || '').split('@')[0],
      image: userResponse.picture || null,
      emailVerified: userResponse.verified_email
    })
  } catch (error: unknown) {
    const err = error as { message?: string; statusCode?: number; data?: unknown }
    console.error('[auth/google] OAuth error:', err?.message ?? error)
    if (err?.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      throw error
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to authenticate with Google'
    })
  }
})
