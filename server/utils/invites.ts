import { and, eq, isNull, gt } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db, schema } from '../db'
import {
  generateInviteToken,
  hashInviteToken,
  inviteExpiresAt,
  isPendingInvite,
  type InviteRole
} from './inviteToken'

export async function createInvite(createdBy: string, role: InviteRole, origin: string) {
  const token = generateInviteToken()
  const id = nanoid()
  const createdAt = new Date()
  const expiresAt = inviteExpiresAt(createdAt)
  await db.insert(schema.invites).values({
    id,
    tokenHash: await hashInviteToken(token),
    role,
    createdBy,
    expiresAt,
    createdAt
  })
  return {
    id,
    url: `${origin}/invite/${token}`,
    role,
    expiresAt
  }
}

export async function listPendingInvites(now = new Date()) {
  const rows = await db.select({
    id: schema.invites.id,
    role: schema.invites.role,
    expiresAt: schema.invites.expiresAt,
    createdAt: schema.invites.createdAt,
    usedAt: schema.invites.usedAt,
    revokedAt: schema.invites.revokedAt
  }).from(schema.invites)

  return rows
    .filter(row => isPendingInvite(row, now))
    .map(({ id, role, expiresAt, createdAt }) => ({ id, role, expiresAt, createdAt }))
}

export async function revokeInvite(id: string, now = new Date()): Promise<boolean> {
  const row = await db.select()
    .from(schema.invites)
    .where(eq(schema.invites.id, id))
    .limit(1)
    .then(rows => rows[0])
  if (!row || !isPendingInvite(row, now)) return false

  await db.update(schema.invites)
    .set({ revokedAt: now })
    .where(eq(schema.invites.id, id))
  return true
}

export async function findSpendableInviteByToken(token: string, now = new Date()) {
  const tokenHash = await hashInviteToken(token)
  const row = await db.select()
    .from(schema.invites)
    .where(eq(schema.invites.tokenHash, tokenHash))
    .limit(1)
    .then(rows => rows[0])
  if (!row || !isPendingInvite(row, now)) return null
  return { id: row.id, role: row.role as InviteRole, expiresAt: row.expiresAt }
}

export async function claimInvite(id: string, now = new Date()): Promise<boolean> {
  const updated = await db.update(schema.invites)
    .set({ usedAt: now })
    .where(and(
      eq(schema.invites.id, id),
      isNull(schema.invites.usedAt),
      isNull(schema.invites.revokedAt),
      gt(schema.invites.expiresAt, now)
    ))
    .returning({ id: schema.invites.id })
  return updated.length > 0
}

export async function releaseInvite(id: string): Promise<void> {
  await db.update(schema.invites)
    .set({ usedAt: null })
    .where(eq(schema.invites.id, id))
}
