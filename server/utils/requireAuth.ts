// requireUserSession is auto-imported by nuxt-auth-utils
export async function requireAuth(event: any) {
  const session = await requireUserSession(event)
  return session
}
