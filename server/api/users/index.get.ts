import { db, schema } from '../../db'
import { desc } from 'drizzle-orm'
import { manageUsers } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  await authorize(event, manageUsers)

  const config = useRuntimeConfig(event)
  const envAdminIds = new Set(
    (config.adminGithubIds || '').split(',').map((s: string) => s.trim()).filter(Boolean)
  )

  const rows = await db.select({
    id: schema.users.id,
    name: schema.users.name,
    email: schema.users.email,
    image: schema.users.image,
    role: schema.users.role,
    githubId: schema.users.githubId,
    createdAt: schema.users.createdAt
  })
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt))

  return rows.map(u => ({
    ...u,
    isEnvAdmin: !!(u.githubId && envAdminIds.has(u.githubId))
  }))
})
