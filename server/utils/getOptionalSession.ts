export async function getOptionalSession(event: Parameters<typeof getUserSession>[0]) {
  try {
    const session = await getUserSession(event)
    if (session?.user) return session
    return null
  } catch {
    return null
  }
}
