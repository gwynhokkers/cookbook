export async function requireAdmin(event: Parameters<typeof requireUserSession>[0]) {
  const session = await requireUserSession(event)
  if ((session.user as Record<string, unknown>)?.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  }
  return session
}
