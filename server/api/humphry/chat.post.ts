import type { UIMessage } from 'ai'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { createHumphryChatResponse } from '../../utils/humphryChatRunner'

const chatBodySchema = z.object({
  messages: z.array(z.object({
    id: z.string().optional(),
    role: z.enum(['user', 'assistant', 'system']),
    parts: z.array(z.record(z.unknown())).optional(),
    content: z.unknown().optional()
  }).passthrough()).max(40)
})

async function getUserId(event: H3Event) {
  const session = await requireUserSession(event)
  const userId = (session.user as Record<string, unknown> | undefined)?.id as string | undefined
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Sign in required'
    })
  }
  return userId
}

export default defineEventHandler(async (event) => {
  const userId = await getUserId(event)
  const body = await readBody(event)
  const parsed = chatBodySchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid chat request'
    })
  }

  try {
    return await createHumphryChatResponse(
      event,
      parsed.data.messages as UIMessage[],
      userId
    )
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    const message = error instanceof Error ? error.message : 'Humphry failed to respond'
    if (/rate limit|429/i.test(message)) {
      throw createError({
        statusCode: 429,
        statusMessage: 'AI rate limit exceeded. Please try again later.'
      })
    }

    throw createError({
      statusCode: 500,
      statusMessage: message
    })
  }
})
