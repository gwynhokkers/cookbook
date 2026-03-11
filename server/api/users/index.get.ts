import { db, schema } from '../../db'
import { desc } from 'drizzle-orm'
import { manageUsers } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  await authorize(event, manageUsers)

  const config = useRuntimeConfig(event)
  const envAdminGithubIds = new Set(
    (config.adminGithubIds || '').split(',').map((s: string) => s.trim()).filter(Boolean)
  )
  const envAdminGoogleIds = new Set(
    (config.adminGoogleIds || '').split(',').map((s: string) => s.trim()).filter(Boolean)
  )

  const rows = await db.select({
    id: schema.users.id,
    name: schema.users.name,
    email: schema.users.email,
    image: schema.users.image,
    role: schema.users.role,
    githubId: schema.users.githubId,
    googleId: schema.users.googleId,
    createdAt: schema.users.createdAt
  })
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt))

  return rows.map(u => ({
    ...u,
    isEnvAdmin: !!(u.githubId && envAdminGithubIds.has(u.githubId)) || !!(u.googleId && envAdminGoogleIds.has(u.googleId))
  }))
})
