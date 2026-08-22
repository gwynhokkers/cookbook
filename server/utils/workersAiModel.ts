import type { H3Event } from 'h3'
import { createWorkersAI } from 'workers-ai-provider'
import { resolveWorkersAiBinding } from './aiClient'

export function getWorkersAiModel(event: H3Event, modelId: string) {
  const binding = resolveWorkersAiBinding(event)
  const gatewayId = process.env.NUXT_HUB_CLOUDFLARE_GATEWAY_ID?.trim()
  const gateway = gatewayId ? { id: gatewayId } : undefined

  if (binding) {
    const workersai = createWorkersAI({ binding, gateway })
    return workersai(modelId)
  }

  const accountId = process.env.NUXT_HUB_CLOUDFLARE_ACCOUNT_ID
  const apiKey = process.env.NUXT_HUB_CLOUDFLARE_API_TOKEN

  if (accountId && apiKey) {
    const workersai = createWorkersAI({ accountId, apiKey, gateway })
    return workersai(modelId)
  }

  throw createError({
    statusCode: 500,
    statusMessage:
      'AI binding not available. Set NUXT_HUB_CLOUDFLARE_ACCOUNT_ID and NUXT_HUB_CLOUDFLARE_API_TOKEN in .env, or ensure the Workers AI binding is configured in wrangler.jsonc.'
  })
}
