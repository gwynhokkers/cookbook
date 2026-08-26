import { createError } from 'h3'

export function requireUserId(session: { user?: unknown }) {
  const userId = (session.user as Record<string, unknown> | undefined)?.id as string | undefined
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Sign in required'
    })
  }
  return userId
}

export function assertUserOwnsShoppingList<T extends { userId: string }>(
  list: T | null | undefined,
  userId: string
): T {
  if (!list || list.userId !== userId) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Shopping list not found'
    })
  }
  return list
}

export async function requireShoppingUserId(event: Parameters<typeof requireUserSession>[0]) {
  const session = await requireUserSession(event)
  return requireUserId(session)
}
