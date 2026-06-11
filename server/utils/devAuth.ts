import { eq } from 'drizzle-orm'
import { db, schema } from '../db'
import {
  DEV_AUTH_PERSONAS,
  isDevAuthPersona,
  type DevAuthPersona
} from '~~/shared/dev-auth-personas'

export function assertDevAuthEnabled(event: Parameters<typeof useRuntimeConfig>[0]) {
  if (!import.meta.dev) {
    throw createError({ statusCode: 404 })
  }
  if (!useRuntimeConfig(event).devAuth) {
    throw createError({ statusCode: 404 })
  }
}

export async function upsertDevPersona(persona: DevAuthPersona) {
  const config = DEV_AUTH_PERSONAS[persona]

  const existing = await db.select()
    .from(schema.users)
    .where(eq(schema.users.id, config.id))
    .limit(1)
    .then(rows => rows[0])

  if (existing) {
    await db.update(schema.users)
      .set({
        name: config.name,
        email: config.email,
        image: config.image,
        role: config.role,
        emailVerified: true,
        updatedAt: new Date()
      })
      .where(eq(schema.users.id, config.id))

    return {
      id: config.id,
      name: config.name,
      email: config.email,
      image: config.image,
      role: config.role
    }
  }

  await db.insert(schema.users).values({
    id: config.id,
    name: config.name,
    email: config.email,
    image: config.image,
    role: config.role,
    emailVerified: true
  })

  return {
    id: config.id,
    name: config.name,
    email: config.email,
    image: config.image,
    role: config.role
  }
}

export function parseDevAuthPersona(value: unknown): DevAuthPersona {
  const persona = typeof value === 'string' ? value : ''
  if (!isDevAuthPersona(persona)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid persona. Must be one of: viewer, editor, admin'
    })
  }
  return persona
}
