import type { H3Event } from 'h3'
import { createWorkersAI } from 'workers-ai-provider'
import { resolveWorkersAiBinding } from './aiClient'
import { humphryDebugLog } from './humphryDebugLog'

function resolveExplicitRestCredentials() {
  const accountId = process.env.NUXT_HUB_CLOUDFLARE_ACCOUNT_ID?.trim()
  const apiKey = process.env.NUXT_HUB_CLOUDFLARE_API_TOKEN?.trim()

  if (!accountId || !apiKey) {
    return null
  }

  return { accountId, apiKey }
}

function wrapBindingRun(binding: Ai, transport: 'rest' | 'binding'): Ai {
  const originalRun = binding.run.bind(binding)

  return {
    ...binding,
    run: async (model, inputs, options) => {
      const result = await originalRun(model, inputs, options)

      if (result == null) {
        // #region agent log
        humphryDebugLog({
          hypothesisId: 'G',
          location: 'workersAiModel.ts:wrapBindingRun',
          message: 'workers AI run returned empty result',
          data: { transport, model: String(model) }
        })
        // #endregion

        throw createError({
          statusCode: 502,
          statusMessage: transport === 'rest'
            ? 'Workers AI REST returned an empty response. Verify NUXT_HUB_CLOUDFLARE_ACCOUNT_ID and NUXT_HUB_CLOUDFLARE_API_TOKEN are set as Production secrets with Workers AI Read permission.'
            : 'Workers AI binding returned an empty response.'
        })
      }

      return result
    }
  }
}

export function getWorkersAiModel(event: H3Event, modelId: string) {
  const gatewayId = process.env.NUXT_HUB_CLOUDFLARE_GATEWAY_ID?.trim()
  const gateway = gatewayId ? { id: gatewayId } : undefined
  const restCredentials = resolveExplicitRestCredentials()

  // Use REST only with explicit NUXT_HUB_* secrets. Do not fall back to build-time
  // CLOUDFLARE_* vars — those often lack Workers AI permission and return empty results.
  if (restCredentials) {
    // #region agent log
    humphryDebugLog({
      hypothesisId: 'E',
      location: 'workersAiModel.ts:getWorkersAiModel',
      message: 'using REST workers-ai transport',
      data: {
        hasGateway: !!gatewayId,
        accountIdPrefix: restCredentials.accountId.slice(0, 4)
      }
    })
    // #endregion

    const workersai = createWorkersAI({
      accountId: restCredentials.accountId,
      apiKey: restCredentials.apiKey,
      gateway
    })
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

    const workersai = createWorkersAI({
      binding: wrapBindingRun(binding, 'binding'),
      gateway
    })
    return workersai(modelId)
  }

  throw createError({
    statusCode: 500,
    statusMessage:
      'Humphry AI is not configured. Set NUXT_HUB_CLOUDFLARE_ACCOUNT_ID and NUXT_HUB_CLOUDFLARE_API_TOKEN as Cloudflare Pages Production secrets, or configure the Workers AI binding in wrangler.jsonc.'
  })
}
