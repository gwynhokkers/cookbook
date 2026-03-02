import { db, schema } from '../../../db'
import { eq } from 'drizzle-orm'
import { manageUsers } from '~~/shared/utils/abilities'

const VALID_ROLES = ['viewer', 'editor', 'admin']

export default defineEventHandler(async (event) => {
  await authorize(event, manageUsers)

  const userId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'User ID is required' })
  }

  const { role } = body
  if (!role || !VALID_ROLES.includes(role)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` })
  }

  const existing = await db.select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)

  if (!existing || existing.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  const config = useRuntimeConfig(event)
  const envAdminIds = (config.adminGithubIds || '').split(',').map((s: string) => s.trim()).filter(Boolean)
  if (existing[0].githubId && envAdminIds.includes(existing[0].githubId)) {
    throw createError({ statusCode: 403, statusMessage: 'Cannot change role of an environment-defined admin' })
  }

  await db.update(schema.users)
    .set({ role, updatedAt: new Date() })
    .where(eq(schema.users.id, userId))

  const updated = await db.select({
    id: schema.users.id,
    name: schema.users.name,
    email: schema.users.email,
    image: schema.users.image,
    role: schema.users.role,
    githubId: schema.users.githubId,
    createdAt: schema.users.createdAt
  })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)

  return updated[0]
})
