import { eq } from 'drizzle-orm'
import { db, schema } from '../db'
import { planSessionRefresh, toSessionUser, type SessionUser } from '../utils/sessionRefresh'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', async (event) => {
    const user = await refreshSessionUser(event)
    event.context.$authorization = {
      resolveServerUser: async () => user
    }
  })
})

async function refreshSessionUser(event: Parameters<typeof getUserSession>[0]): Promise<SessionUser | null> {
  const session = await getUserSession(event)
  const sealedUser = session.user
    ? toSessionUser({
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
        role: session.user.role
      })
    : null

  if (!sealedUser) return null

  const row = await db.select()
    .from(schema.users)
    .where(eq(schema.users.id, sealedUser.id))
    .limit(1)
    .then(rows => rows[0])

  const dbUser = row ? toSessionUser(row) : null
  const sessionName = useRuntimeConfig(event).session?.name ?? 'nuxt-session'
  const stored = event.context.sessions?.[sessionName] as { createdAt?: number } | undefined
  const now = Date.now()
  const plan = planSessionRefresh({
    sealedUser,
    dbUser,
    createdAt: stored?.createdAt ?? now,
    now
  })

  if (plan.action === 'clear') {
    await clearUserSession(event)
    return null
  }

  if (plan.action === 'reseal') {
    if (plan.slide && stored) {
      stored.createdAt = now
    }
    await setUserSession(event, { user: plan.user })
  }

  return dbUser
}
