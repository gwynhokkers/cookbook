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

  const redirectUri = `${getRequestURL(event).origin}/auth/github`

  try {
    // Exchange code for access token
    const tokenResponse = await $fetch<{ access_token: string }>('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri
      }
    })

    const accessToken = tokenResponse.access_token

    // Get user info from GitHub
    const userResponse = await $fetch<{
      id: number
      login: string
      name: string
      email: string
      avatar_url: string
    }>('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    })

    // Get user email (might need to fetch from emails endpoint)
    let email = userResponse.email
    if (!email) {
      const emails = await $fetch<Array<{ email: string; primary: boolean }>>('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      })
      const primaryEmail = emails.find(e => e.primary)
      email = primaryEmail?.email || emails[0]?.email || ''
    }

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

      if (user) {
        // Update existing user with GitHub ID
        await db.update(schema.users)
          .set({
            githubId,
            image: userResponse.avatar_url,
            updatedAt: new Date()
          })
          .where(eq(schema.users.id, user.id))
        user = { ...user, githubId, image: userResponse.avatar_url }
      } else {
        // Create new user
        const userId = nanoid()
        await db.insert(schema.users).values({
          id: userId,
          name: userResponse.name || userResponse.login,
          email,
          githubId,
          image: userResponse.avatar_url,
          emailVerified: true
        })
        user = await db.select().from(schema.users)
          .where(eq(schema.users.id, userId))
          .limit(1)
          .then(rows => rows[0])!
      }
    } else {
      // Update user info
      await db.update(schema.users)
        .set({
          name: userResponse.name || userResponse.login,
          email,
          image: userResponse.avatar_url,
          updatedAt: new Date()
        })
        .where(eq(schema.users.id, user.id))
      user = { ...user, name: userResponse.name || userResponse.login, email, image: userResponse.avatar_url }
    }

    // Set user session
    await setUserSession(event, {
      user: {
        id: user.id,
        name: user.name || userResponse.login,
        email: user.email,
        image: user.image
      }
    })

    // Redirect to home
    return sendRedirect(event, '/')
  } catch (error: any) {
    console.error('GitHub OAuth error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to authenticate with GitHub'
    })
  }
})
