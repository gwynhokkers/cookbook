import type { UIMessage } from 'ai'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { createHumphryChatResponse } from '../../utils/humphryChatRunner'
import { persistHumphryChatTurn } from '../../utils/humphrySessions'
import { requireShoppingUserId } from '../../utils/shoppingAuth'

const chatBodySchema = z.object({
  sessionId: z.string().min(1),
  messages: z.array(z.object({
    id: z.string().optional(),
    role: z.enum(['user', 'assistant', 'system']),
    parts: z.array(z.record(z.unknown())).optional(),
    content: z.unknown().optional()
  }).passthrough()).max(40)
})

export default defineEventHandler(async (event) => {
  const userId = await requireShoppingUserId(event)
  const body = await readBody(event)
  const parsed = chatBodySchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid chat request. sessionId and messages are required.'
    })
  }

  const uiMessages = parsed.data.messages as UIMessage[]
  const sessionId = parsed.data.sessionId

  // Persist inbound messages (including the latest user turn) before generation.
  await persistHumphryChatTurn(sessionId, userId, uiMessages)

  try {
    return await createHumphryChatResponse(
      event,
      uiMessages,
      userId,
      sessionId
    )
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    const message = error instanceof Error ? error.message : 'Humphry failed to respond'

    if (/reading 'choices'|empty response/i.test(message)) {
      throw createError({
        statusCode: 502,
        statusMessage:
          'Workers AI returned an invalid response. Check NUXT_HUB_CLOUDFLARE_ACCOUNT_ID and NUXT_HUB_CLOUDFLARE_API_TOKEN are set as Cloudflare Pages Production secrets (not build-only CLOUDFLARE_* vars) with Workers AI Read permission.'
      })
    }

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
