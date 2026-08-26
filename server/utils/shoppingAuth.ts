function requireUserId(session: { user?: unknown }) {
  const userId = (session.user as Record<string, unknown> | undefined)?.id as string | undefined
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Sign in required'
    })
  }
  return userId
}

export async function requireShoppingUserId(event: Parameters<typeof requireUserSession>[0]) {
  const session = await requireUserSession(event)
  return requireUserId(session)
}
