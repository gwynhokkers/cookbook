import type { UIMessage } from 'ai'
import { and, asc, desc, eq, inArray, like } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db, schema } from '../db'

const TITLE_MAX = 70
const DATE_SUFFIX_RE = / - \d{2}\/\d{2}\/\d{2}$/

export type HumphrySessionSummary = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  lastMessageAt: string
}

export type HumphrySessionDetail = HumphrySessionSummary & {
  messages: UIMessage[]
}

function toIso(value: Date | number | null | undefined): string {
  if (value == null) {
    return new Date().toISOString()
  }
  const date = value instanceof Date ? value : new Date(value)
  return date.toISOString()
}

export function formatSessionDate(date = new Date()): string {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = String(date.getFullYear()).slice(-2)
  return `${day}/${month}/${year}`
}

export function buildSessionTitle(firstPrompt: string, date = new Date()): string {
  const suffix = ` - ${formatSessionDate(date)}`
  const maxPrompt = Math.max(1, TITLE_MAX - suffix.length)
  const trimmed = firstPrompt.trim().replace(/\s+/g, ' ')
  const promptPart = trimmed.length > maxPrompt
    ? `${trimmed.slice(0, Math.max(1, maxPrompt - 1)).trimEnd()}…`
    : trimmed
  return `${promptPart || 'New chat'}${suffix}`
}

export function flattenMessageSearchText(parts: unknown[]): string {
  const chunks: string[] = []
  for (const part of parts) {
    if (!part || typeof part !== 'object') {
      continue
    }
    const record = part as Record<string, unknown>
    if (typeof record.text === 'string') {
      chunks.push(record.text)
    }
    if (typeof record.output === 'string') {
      chunks.push(record.output)
    } else if (record.output && typeof record.output === 'object') {
      try {
        chunks.push(JSON.stringify(record.output))
      } catch {
        /* ignore */
      }
    }
  }
  return chunks.join(' ').replace(/\s+/g, ' ').trim()
}

export async function assertHumphrySessionOwned(sessionId: string, userId: string) {
  const rows = await db.select()
    .from(schema.humphryChatSessions)
    .where(and(
      eq(schema.humphryChatSessions.id, sessionId),
      eq(schema.humphryChatSessions.userId, userId)
    ))
    .limit(1)

  if (!rows.length) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Chat session not found'
    })
  }

  return rows[0]!
}

function mapSession(row: typeof schema.humphryChatSessions.$inferSelect): HumphrySessionSummary {
  return {
    id: row.id,
    title: row.title,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    lastMessageAt: toIso(row.lastMessageAt)
  }
}

export async function createHumphrySession(userId: string, title = 'New chat') {
  const id = nanoid()
  const now = new Date()
  await db.insert(schema.humphryChatSessions).values({
    id,
    userId,
    title,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now
  })
  return mapSession({
    id,
    userId,
    title,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now
  })
}

export async function listHumphrySessions(
  userId: string,
  opts: { limit?: number, offset?: number } = {}
) {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50)
  const offset = Math.max(opts.offset ?? 0, 0)

  const rows = await db.select()
    .from(schema.humphryChatSessions)
    .where(eq(schema.humphryChatSessions.userId, userId))
    .orderBy(desc(schema.humphryChatSessions.lastMessageAt))
    .limit(limit)
    .offset(offset)

  return rows.map(mapSession)
}

export async function searchHumphrySessions(
  userId: string,
  query: string,
  opts: { limit?: number, offset?: number } = {}
) {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50)
  const offset = Math.max(opts.offset ?? 0, 0)
  const q = query.trim()
  if (!q) {
    return listHumphrySessions(userId, { limit, offset })
  }

  const pattern = `%${q.replace(/[%_]/g, '')}%`

  const titleMatches = await db.select({
    id: schema.humphryChatSessions.id
  })
    .from(schema.humphryChatSessions)
    .where(and(
      eq(schema.humphryChatSessions.userId, userId),
      like(schema.humphryChatSessions.title, pattern)
    ))

  const messageMatches = await db.select({
    id: schema.humphryChatSessions.id
  })
    .from(schema.humphryChatSessions)
    .innerJoin(
      schema.humphryChatMessages,
      eq(schema.humphryChatMessages.sessionId, schema.humphryChatSessions.id)
    )
    .where(and(
      eq(schema.humphryChatSessions.userId, userId),
      like(schema.humphryChatMessages.searchText, pattern)
    ))

  const ids = [...new Set([
    ...titleMatches.map(row => row.id),
    ...messageMatches.map(row => row.id)
  ])]

  if (!ids.length) {
    return []
  }

  const rows = await db.select()
    .from(schema.humphryChatSessions)
    .where(and(
      eq(schema.humphryChatSessions.userId, userId),
      inArray(schema.humphryChatSessions.id, ids)
    ))
    .orderBy(desc(schema.humphryChatSessions.lastMessageAt))
    .limit(limit)
    .offset(offset)

  return rows.map(mapSession)
}

export async function loadHumphrySession(
  sessionId: string,
  userId: string
): Promise<HumphrySessionDetail> {
  const session = await assertHumphrySessionOwned(sessionId, userId)

  const messageRows = await db.select()
    .from(schema.humphryChatMessages)
    .where(eq(schema.humphryChatMessages.sessionId, sessionId))
    .orderBy(asc(schema.humphryChatMessages.createdAt))

  const messages: UIMessage[] = messageRows.map(row => ({
    id: row.messageId,
    role: row.role as UIMessage['role'],
    parts: (row.parts || []) as UIMessage['parts']
  }))

  return {
    ...mapSession(session),
    messages
  }
}

export async function renameHumphrySession(
  sessionId: string,
  userId: string,
  title: string
) {
  await assertHumphrySessionOwned(sessionId, userId)
  const cleaned = title.trim().slice(0, TITLE_MAX) || 'New chat'
  const now = new Date()
  await db.update(schema.humphryChatSessions)
    .set({
      title: cleaned,
      updatedAt: now
    })
    .where(eq(schema.humphryChatSessions.id, sessionId))

  return loadHumphrySession(sessionId, userId)
}

export async function deleteHumphrySession(sessionId: string, userId: string) {
  await assertHumphrySessionOwned(sessionId, userId)
  await db.delete(schema.humphryChatSessions)
    .where(eq(schema.humphryChatSessions.id, sessionId))
  return { deleted: true }
}

function extractFirstUserText(messages: UIMessage[]): string | null {
  for (const message of messages) {
    if (message.role !== 'user') {
      continue
    }
    for (const part of message.parts || []) {
      if (part && typeof part === 'object' && 'type' in part && part.type === 'text' && 'text' in part) {
        const text = String((part as { text?: unknown }).text || '').trim()
        if (text) {
          return text
        }
      }
    }
  }
  return null
}

export async function persistHumphryChatTurn(
  sessionId: string,
  userId: string,
  uiMessages: UIMessage[]
) {
  const session = await assertHumphrySessionOwned(sessionId, userId)

  const existing = await db.select({
    messageId: schema.humphryChatMessages.messageId
  })
    .from(schema.humphryChatMessages)
    .where(eq(schema.humphryChatMessages.sessionId, sessionId))

  const existingIds = new Set(existing.map(row => row.messageId))
  const now = new Date()
  const toInsert = uiMessages.filter(message => message.id && !existingIds.has(message.id))

  if (toInsert.length) {
    await db.insert(schema.humphryChatMessages).values(
      toInsert.map((message, index) => ({
        id: nanoid(),
        sessionId,
        messageId: message.id,
        role: message.role,
        parts: message.parts || [],
        searchText: flattenMessageSearchText((message.parts || []) as unknown[]),
        createdAt: new Date(now.getTime() + index)
      }))
    )
  }

  const updates: Partial<typeof schema.humphryChatSessions.$inferInsert> = {
    updatedAt: now,
    lastMessageAt: now
  }

  const isDefaultTitle = !session.title
    || session.title === 'New chat'
    || !DATE_SUFFIX_RE.test(session.title)

  if (isDefaultTitle) {
    const firstPrompt = extractFirstUserText(uiMessages)
    if (firstPrompt) {
      updates.title = buildSessionTitle(firstPrompt)
    }
  }

  await db.update(schema.humphryChatSessions)
    .set(updates)
    .where(eq(schema.humphryChatSessions.id, sessionId))
}

export async function appendAssistantMessage(
  sessionId: string,
  userId: string,
  message: UIMessage
) {
  await assertHumphrySessionOwned(sessionId, userId)
  const now = new Date()

  const existing = await db.select({ id: schema.humphryChatMessages.id })
    .from(schema.humphryChatMessages)
    .where(and(
      eq(schema.humphryChatMessages.sessionId, sessionId),
      eq(schema.humphryChatMessages.messageId, message.id)
    ))
    .limit(1)

  if (!existing.length) {
    await db.insert(schema.humphryChatMessages).values({
      id: nanoid(),
      sessionId,
      messageId: message.id,
      role: message.role,
      parts: message.parts || [],
      searchText: flattenMessageSearchText((message.parts || []) as unknown[]),
      createdAt: now
    })
  }

  await db.update(schema.humphryChatSessions)
    .set({
      updatedAt: now,
      lastMessageAt: now
    })
    .where(eq(schema.humphryChatSessions.id, sessionId))
}

export async function replaceSessionMessages(
  sessionId: string,
  userId: string,
  messages: UIMessage[]
) {
  await assertHumphrySessionOwned(sessionId, userId)

  await db.delete(schema.humphryChatMessages)
    .where(eq(schema.humphryChatMessages.sessionId, sessionId))

  const now = new Date()
  if (messages.length) {
    await db.insert(schema.humphryChatMessages).values(
      messages.map((message, index) => ({
        id: nanoid(),
        sessionId,
        messageId: message.id || nanoid(),
        role: message.role,
        parts: message.parts || [],
        searchText: flattenMessageSearchText((message.parts || []) as unknown[]),
        createdAt: new Date(now.getTime() + index)
      }))
    )
  }

  const firstPrompt = extractFirstUserText(messages)
  await db.update(schema.humphryChatSessions)
    .set({
      title: firstPrompt ? buildSessionTitle(firstPrompt) : 'New chat',
      updatedAt: now,
      lastMessageAt: now
    })
    .where(eq(schema.humphryChatSessions.id, sessionId))
}
