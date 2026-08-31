import type { H3Event } from 'h3'
import { createWorkersAI } from 'workers-ai-provider'

/**
 * Workers AI port: one credential/binding seam, two capabilities.
 * - client()       → raw run / runTextModel (Extraction)
 * - languageModel() → Vercel AI SDK model (Humphry, shopping enrich)
 */

export interface AIClient {
  run: (model: string, options: Record<string, unknown>) => Promise<unknown>
  runTextModel: (model: string, options: Record<string, unknown>) => Promise<unknown>
}

export interface WorkersAi {
  client: () => Promise<AIClient>
  languageModel: (modelId: string) => ReturnType<ReturnType<typeof createWorkersAI>>
}

type CloudflareWorkerEnv = Record<string, string | undefined>

type AiBinding = { run: AIClient['run'] }

/** Minimal Workers AI binding shape (Cloudflare `Ai` binding). */
type WorkersAiBinding = AiBinding & Record<string, unknown>

type AiEventLike = {
  context?: { cloudflare?: { env?: CloudflareWorkerEnv & { AI?: WorkersAiBinding } } }
  req?: { runtime?: { cloudflare?: { env?: CloudflareWorkerEnv & { AI?: WorkersAiBinding } } } }
}

const normalizeErrorDetail = (value: unknown, fallback = 'Unknown error', maxLength = 2000): string => {
  const base = typeof value === 'string'
    ? value
    : (() => {
        try {
          return JSON.stringify(value)
        } catch {
          return String(value)
        }
      })()

  const compact = base.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!compact) {
    return fallback
  }

  return compact.slice(0, maxLength)
}

function readEnvValue(event: H3Event | AiEventLike | undefined, key: string): string | undefined {
  const h3Event = event as H3Event | undefined
  const config = h3Event && typeof useRuntimeConfig === 'function'
    ? (() => {
        try {
          return useRuntimeConfig(h3Event)
        } catch {
          return null
        }
      })()
    : null

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

function resolveCredentials(event: H3Event | AiEventLike | undefined) {
  return {
    accountId: readEnvValue(event, 'NUXT_HUB_CLOUDFLARE_ACCOUNT_ID'),
    apiToken: readEnvValue(event, 'NUXT_HUB_CLOUDFLARE_API_TOKEN'),
    gatewayId: readEnvValue(event, 'NUXT_HUB_CLOUDFLARE_GATEWAY_ID'),
    gatewayAuthToken: readEnvValue(event, 'NUXT_HUB_CLOUDFLARE_GATEWAY_AUTH_TOKEN')
      || process.env.NUXT_HUB_CLOUDFLARE_GATEWAY_AUTH_TOKEN?.trim()
  }
}

function resolveAiBinding(event?: H3Event | AiEventLike): WorkersAiBinding | undefined {
  const fromContext = event?.context?.cloudflare?.env?.AI
  if (fromContext) {
    return fromContext
  }

  const fromReq = (event as AiEventLike | undefined)?.req?.runtime?.cloudflare?.env?.AI
  if (fromReq) {
    return fromReq
  }

  return (process.env as { AI?: WorkersAiBinding }).AI
}

function wrapBindingClient(binding: AiBinding): AIClient {
  return {
    run: (model, options) => binding.run(model, options),
    runTextModel: (model, options) => binding.run(model, options)
  }
}

function throwGatewayHttpError(response: Response, errorText: string, gatewayAuthToken?: string) {
  let errorData: Record<string, unknown> = { message: errorText }
  try {
    errorData = JSON.parse(errorText) as Record<string, unknown>
  } catch {
    /* use raw text */
  }

  if (response.status === 429) {
    throw createError({
      statusCode: 429,
      statusMessage: 'AI rate limit exceeded. Please try again later.'
    })
  }
  if (response.status === 402) {
    throw createError({
      statusCode: 402,
      statusMessage: 'AI quota exceeded. Please check your Cloudflare plan limits.'
    })
  }

  const errArr = errorData.error as Array<{ code?: number, message?: string }> | undefined
  if (response.status === 400 && errArr?.[0]?.code === 2001) {
    throw createError({
      statusCode: 400,
      statusMessage:
        'AI Gateway not properly configured. Ensure the gateway has Workers AI as a provider and NUXT_HUB_CLOUDFLARE_GATEWAY_ID matches the gateway name.'
    })
  }

  const gatewayErr = (errorData.errors as Array<{ code?: number, message?: string }> | undefined)?.[0]
    || errArr?.[0]
  const gatewayErrCode = gatewayErr?.code
  if (response.status === 401 && (gatewayErrCode === 10000 || gatewayErrCode === 2009)) {
    const cfMsg = gatewayErr?.message || ''
    const hasGatewayAuth = !!gatewayAuthToken
    const detail = [
      cfMsg && `Cloudflare (${gatewayErrCode}): ${cfMsg}`,
      gatewayErrCode === 2009
        && 'Code 2009 usually means the Cloudflare API token was rejected. Use a token with Workers AI: Read and AI Gateway: Read.',
      hasGatewayAuth
        && 'If Authenticated Gateway is off, try removing NUXT_HUB_CLOUDFLARE_GATEWAY_AUTH_TOKEN.',
      hasGatewayAuth
        && 'If Authenticated Gateway is on, set NUXT_HUB_CLOUDFLARE_GATEWAY_AUTH_TOKEN from the AI Gateway dashboard.'
    ].filter(Boolean).join(' ')
    throw createError({
      statusCode: 401,
      statusMessage: `Authentication failed. ${detail}`
    })
  }

  const errorsArr = errorData.errors as Array<{ message?: string }> | undefined
  const dynamicErrorMessage = (errorData.message as string)
    || errArr?.[0]?.message
    || errorsArr?.[0]?.message
    || errorText
  throw createError({
    statusCode: response.status,
    statusMessage: 'Cloudflare AI API error',
    data: {
      detail: normalizeErrorDetail(dynamicErrorMessage, 'Unknown Cloudflare AI API error', 4000)
    }
  })
}

function createGatewayAIClient(
  accountId: string,
  gatewayIdForUrl: string,
  apiToken: string,
  gatewayAuthToken?: string
): AIClient {
  const buildHeaders = (includeCfAig: boolean): Record<string, string> => {
    const h: Record<string, string> = {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    }
    if (includeCfAig && gatewayAuthToken) {
      h['cf-aig-authorization'] = `Bearer ${gatewayAuthToken}`
    }
    return h
  }

  const gatewayPost = async (url: string, body: string) => {
    const gatewayFetchAttempt = async (headers: Record<string, string>) => {
      const res = await fetch(url, { method: 'POST', headers, body })
      const bodyText = await res.text()
      return { res, bodyText }
    }

    let result = await gatewayFetchAttempt(buildHeaders(true))
    if (!result.res.ok && result.res.status === 401 && gatewayAuthToken) {
      result = await gatewayFetchAttempt(buildHeaders(false))
    }
    if (!result.res.ok && result.res.status === 401 && gatewayAuthToken) {
      result = await gatewayFetchAttempt({
        Authorization: `Bearer ${gatewayAuthToken}`,
        'Content-Type': 'application/json'
      })
    }

    if (!result.res.ok) {
      throwGatewayHttpError(result.res, result.bodyText, gatewayAuthToken)
    }

    return JSON.parse(result.bodyText) as Record<string, unknown>
  }

  return {
    run: async (model, options) => {
      const url = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayIdForUrl}/workers-ai/${model}`
      const data = await gatewayPost(url, JSON.stringify(options))
      return data.result || data
    },
    runTextModel: async (model, options) => {
      const url = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayIdForUrl}/compat/chat/completions`
      const body = {
        model: `workers-ai/${model}`,
        messages: options.messages,
        max_tokens: options.max_tokens,
        temperature: options.temperature,
        top_p: options.top_p,
        seed: options.seed,
        response_format: options.response_format
      }
      const data = await gatewayPost(url, JSON.stringify(body))
      const choices = data.choices as Array<{ message?: { content?: string } }> | undefined
      const content = choices?.[0]?.message?.content
      if (typeof content === 'string') {
        return { response: content }
      }
      return data.result || data
    }
  }
}

function wrapBindingRun(binding: WorkersAiBinding, transport: 'rest' | 'binding'): WorkersAiBinding {
  const originalRun = (binding.run as (...args: unknown[]) => Promise<unknown>).bind(binding)

  return {
    ...binding,
    run: (async (...args: unknown[]) => {
      const result = await originalRun(...args)

      if (result == null) {
        throw createError({
          statusCode: 502,
          statusMessage: transport === 'rest'
            ? 'Workers AI REST returned an empty response. Verify NUXT_HUB_CLOUDFLARE_ACCOUNT_ID and NUXT_HUB_CLOUDFLARE_API_TOKEN are set as Production secrets with Workers AI Read permission.'
            : 'Workers AI binding returned an empty response.'
        })
      }

      return result
    }) as WorkersAiBinding['run']
  }
}

async function createExtractionClient(event?: H3Event | AiEventLike): Promise<AIClient> {
  // Prefer binding (Extraction's historical order), then gateway REST.
  const binding = resolveAiBinding(event)
  if (binding) {
    return wrapBindingClient(binding)
  }

  const { accountId, apiToken, gatewayId, gatewayAuthToken } = resolveCredentials(event)

  if (accountId && apiToken) {
    if (!gatewayId) {
      throw createError({
        statusCode: 500,
        statusMessage:
          'AI Gateway ID not configured. Add NUXT_HUB_CLOUDFLARE_GATEWAY_ID to your .env file.'
      })
    }
    return createGatewayAIClient(accountId, gatewayId, apiToken, gatewayAuthToken)
  }

  if (!accountId || !apiToken) {
    throw createError({
      statusCode: 500,
      statusMessage:
        'AI binding not available. Set NUXT_HUB_CLOUDFLARE_ACCOUNT_ID, NUXT_HUB_CLOUDFLARE_API_TOKEN, and NUXT_HUB_CLOUDFLARE_GATEWAY_ID in .env.'
    })
  }

  throw createError({
    statusCode: 500,
    statusMessage:
      'AI binding not available. Ensure the Workers AI binding is configured in wrangler.jsonc for production.'
  })
}

function createLanguageModel(event: H3Event | AiEventLike | undefined, modelId: string) {
  // Prefer explicit REST credentials (Humphry's historical order), then binding.
  const { accountId, apiToken, gatewayId } = resolveCredentials(event)
  const gateway = gatewayId ? { id: gatewayId } : undefined

  if (accountId && apiToken) {
    const workersai = createWorkersAI({
      accountId,
      apiKey: apiToken,
      gateway
    })
    return workersai(modelId)
  }

  const binding = resolveAiBinding(event)
  if (binding) {
    const workersai = createWorkersAI({
      // workers-ai-provider expects the Cloudflare Ai binding; our minimal shape is compatible at runtime.
      binding: wrapBindingRun(binding, 'binding') as never,
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

/** Unified Workers AI port for this request. */
export function getWorkersAi(event?: H3Event | AiEventLike): WorkersAi {
  return {
    client: () => createExtractionClient(event),
    languageModel: modelId => createLanguageModel(event, modelId)
  }
}

export function resolveWorkersAiBinding(event?: H3Event | AiEventLike): WorkersAiBinding | undefined {
  return resolveAiBinding(event)
}
