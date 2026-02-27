export async function requireEditor(event: Parameters<typeof requireUserSession>[0]) {
  const session = await requireUserSession(event)
  const role = (session.user as Record<string, unknown>)?.role
  if (role !== 'editor' && role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Editor access required' })
  }
  return session
}
