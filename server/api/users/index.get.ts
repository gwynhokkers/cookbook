import { db, schema } from '../../db'
import { desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const users = await db.select({
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

  return users
})
