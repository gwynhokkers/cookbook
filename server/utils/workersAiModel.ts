import type { H3Event } from 'h3'
import { createWorkersAI } from 'workers-ai-provider'
import { resolveWorkersAiBinding } from './aiClient'
import { humphryDebugLog } from './humphryDebugLog'

type CloudflareWorkerEnv = Record<string, string | undefined>

function readEnvValue(event: H3Event | undefined, key: string): string | undefined {
  const config = event ? useRuntimeConfig(event) : null
  const fromRuntime = (() => {
    if (!config) return undefined
    if (key === 'NUXT_HUB_CLOUDFLARE_ACCOUNT_ID') {
      return String(config.hubCloudflareAccountId || '').trim() || undefined
    }
    if (key === 'NUXT_HUB_CLOUDFLARE_API_TOKEN') {
      return String(config.hubCloudflareApiToken || '').trim() || undefined
    }
    if (key === 'NUXT_HUB_CLOUDFLARE_GATEWAY_ID') {
      return String(config.hubCloudflareGatewayId || '').trim() || undefined
    }
    return undefined
  })()

  if (fromRuntime) {
    return fromRuntime
  }

  const cfEnv = event?.context?.cloudflare?.env as CloudflareWorkerEnv | undefined
  const fromCf = cfEnv?.[key]?.trim()
  if (fromCf) {
    return fromCf
  }

  const globalEnv = (globalThis as { __env__?: CloudflareWorkerEnv }).__env__
  const fromGlobal = globalEnv?.[key]?.trim()
  if (fromGlobal) {
    return fromGlobal
  }

  return process.env[key]?.trim()
}

function resolveExplicitRestCredentials(event: H3Event) {
  const accountId = readEnvValue(event, 'NUXT_HUB_CLOUDFLARE_ACCOUNT_ID')
  const apiKey = readEnvValue(event, 'NUXT_HUB_CLOUDFLARE_API_TOKEN')

  if (!accountId || !apiKey) {
    return null
  }

  return { accountId, apiKey }
}

function resolveGatewayId(event: H3Event) {
  return readEnvValue(event, 'NUXT_HUB_CLOUDFLARE_GATEWAY_ID')
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
  const gatewayId = resolveGatewayId(event)
  const gateway = gatewayId ? { id: gatewayId } : undefined
  const restCredentials = resolveExplicitRestCredentials(event)
  const config = useRuntimeConfig(event)

  // #region agent log
  humphryDebugLog({
    hypothesisId: 'H',
    location: 'workersAiModel.ts:credentialSources',
    message: 'resolved humphry credential sources',
    data: {
      hasRuntimeAccountId: !!String(config.hubCloudflareAccountId || '').trim(),
      hasRuntimeApiToken: !!String(config.hubCloudflareApiToken || '').trim(),
      hasProcessEnvAccountId: !!process.env.NUXT_HUB_CLOUDFLARE_ACCOUNT_ID,
      hasProcessEnvApiToken: !!process.env.NUXT_HUB_CLOUDFLARE_API_TOKEN,
      hasCfEnvAccountId: !!(
        event.context?.cloudflare?.env as CloudflareWorkerEnv | undefined
      )?.NUXT_HUB_CLOUDFLARE_ACCOUNT_ID,
      hasCfEnvApiToken: !!(
        event.context?.cloudflare?.env as CloudflareWorkerEnv | undefined
      )?.NUXT_HUB_CLOUDFLARE_API_TOKEN,
      hasRestCredentials: !!restCredentials,
      hasBinding: !!resolveWorkersAiBinding(event),
      hasGateway: !!gatewayId
    }
  })
  // #endregion

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
