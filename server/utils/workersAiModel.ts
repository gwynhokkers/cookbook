import type { H3Event } from 'h3'
import { createWorkersAI } from 'workers-ai-provider'
import { resolveWorkersAiBinding } from './aiClient'
import { humphryDebugLog } from './humphryDebugLog'

function resolveWorkersAiCredentials() {
  const accountId = process.env.NUXT_HUB_CLOUDFLARE_ACCOUNT_ID?.trim()
    || process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  const apiKey = process.env.NUXT_HUB_CLOUDFLARE_API_TOKEN?.trim()
    || process.env.CLOUDFLARE_API_TOKEN?.trim()

  return { accountId, apiKey }
}

export function getWorkersAiModel(event: H3Event, modelId: string) {
  const gatewayId = process.env.NUXT_HUB_CLOUDFLARE_GATEWAY_ID?.trim()
  const gateway = gatewayId ? { id: gatewayId } : undefined
  const { accountId, apiKey } = resolveWorkersAiCredentials()

  // Prefer the REST/gateway shim (isBinding=false). Local dev uses this path and
  // Humphry tool loops fail on the native Workers AI binding in production.
  if (accountId && apiKey) {
    // #region agent log
    humphryDebugLog({
      hypothesisId: 'E',
      location: 'workersAiModel.ts:getWorkersAiModel',
      message: 'using REST workers-ai transport',
      data: { hasGateway: !!gatewayId }
    })
    // #endregion

    const workersai = createWorkersAI({ accountId, apiKey, gateway })
    return workersai(modelId)
  }

  const binding = resolveWorkersAiBinding(event)
  if (binding) {
    // #region agent log
    humphryDebugLog({
      hypothesisId: 'E',
      location: 'workersAiModel.ts:getWorkersAiModel',
      message: 'using Workers AI binding transport',
      data: { hasGateway: !!gatewayId }
    })
    // #endregion

    const workersai = createWorkersAI({ binding, gateway })
    return workersai(modelId)
  }

  throw createError({
    statusCode: 500,
    statusMessage:
      'AI binding not available. Set NUXT_HUB_CLOUDFLARE_ACCOUNT_ID and NUXT_HUB_CLOUDFLARE_API_TOKEN (or CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN) for Humphry, or configure the Workers AI binding in wrangler.jsonc.'
  })
}
