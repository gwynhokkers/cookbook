// setUserSession is auto-imported by nuxt-auth-utils
import { db, schema } from '../../db'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'

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

    const email = userResponse.email || ''
    const adminGoogleIds = (config.adminGoogleIds || '').split(',').map((s: string) => s.trim()).filter(Boolean)
    const googleId = userResponse.id

    let user = await db.select().from(schema.users)
      .where(eq(schema.users.googleId, googleId))
      .limit(1)
      .then(rows => rows[0])

    if (!user) {
      user = await db.select().from(schema.users)
        .where(eq(schema.users.email, email))
        .limit(1)
        .then(rows => rows[0])

      const assignedRole = adminGoogleIds.includes(googleId) ? 'admin' : 'viewer'

      if (user) {
        await db.update(schema.users)
          .set({
            googleId,
            image: userResponse.picture,
            role: assignedRole,
            updatedAt: new Date()
          })
          .where(eq(schema.users.id, user.id))
        user = { ...user, googleId, image: userResponse.picture ?? user.image, role: assignedRole }
      } else {
        const userId = nanoid()
        await db.insert(schema.users).values({
          id: userId,
          name: userResponse.name || email.split('@')[0],
          email,
          googleId,
          image: userResponse.picture,
          emailVerified: userResponse.verified_email,
          role: assignedRole
        })
        user = await db.select().from(schema.users)
          .where(eq(schema.users.id, userId))
          .limit(1)
          .then(rows => rows[0])!
      }
    } else {
      const roleUpdate = adminGoogleIds.includes(googleId) ? 'admin' : user.role
      await db.update(schema.users)
        .set({
          name: userResponse.name || user.name,
          email,
          image: userResponse.picture ?? user.image,
          role: roleUpdate,
          updatedAt: new Date()
        })
        .where(eq(schema.users.id, user.id))
      user = {
        ...user,
        name: userResponse.name || user.name,
        email,
        image: userResponse.picture ?? user.image,
        role: roleUpdate
      }
    }

    await setUserSession(event, {
      user: {
        id: user.id,
        name: user.name || userResponse.name || email,
        email: user.email,
        image: user.image,
        role: user.role
      }
    })

    return sendRedirect(event, '/')
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
