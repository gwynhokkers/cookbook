export interface AIClient {
  run: (model: string, options: Record<string, unknown>) => Promise<unknown>
  runTextModel: (model: string, options: Record<string, unknown>) => Promise<unknown>
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

function wrapBindingClient(binding: { run: AIClient['run'] }): AIClient {
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

  const errArr = errorData.error as Array<{ code?: number; message?: string }> | undefined
  if (response.status === 400 && errArr?.[0]?.code === 2001) {
    throw createError({
      statusCode: 400,
      statusMessage:
        'AI Gateway not properly configured. Ensure the gateway has Workers AI as a provider and NUXT_HUB_CLOUDFLARE_GATEWAY_ID matches the gateway name.'
    })
  }

  const gatewayErr = (errorData.errors as Array<{ code?: number; message?: string }> | undefined)?.[0]
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

type AiBinding = { run: AIClient['run'] }

function resolveAiBinding(event?: {
  context?: { cloudflare?: { env?: { AI?: AiBinding } } }
  req?: { runtime?: { cloudflare?: { env?: { AI?: AiBinding } } } }
}): AiBinding | undefined {
  return event?.context?.cloudflare?.env?.AI
    ?? event?.req?.runtime?.cloudflare?.env?.AI
    ?? (process.env as { AI?: AiBinding }).AI
}

/**
 * Get AI client - works in both local dev (via API) and production (via binding)
 */
export async function getAIClient(event?: {
  context?: { cloudflare?: { env?: { AI?: AiBinding } } }
  req?: { runtime?: { cloudflare?: { env?: { AI?: AiBinding } } } }
}): Promise<AIClient> {
  const binding = resolveAiBinding(event)
  if (binding) {
    return wrapBindingClient(binding)
  }

  const accountId = process.env.NUXT_HUB_CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.NUXT_HUB_CLOUDFLARE_API_TOKEN
  const gatewayId = process.env.NUXT_HUB_CLOUDFLARE_GATEWAY_ID
  const gatewayAuthToken = process.env.NUXT_HUB_CLOUDFLARE_GATEWAY_AUTH_TOKEN

  if (accountId && apiToken) {
    if (!gatewayId?.trim()) {
      throw createError({
        statusCode: 500,
        statusMessage:
          'AI Gateway ID not configured. Add NUXT_HUB_CLOUDFLARE_GATEWAY_ID to your .env file.'
      })
    }
    return createGatewayAIClient(accountId, gatewayId.trim(), apiToken, gatewayAuthToken)
  }

  const hasCloudflareCreds = process.env.NUXT_HUB_CLOUDFLARE_ACCOUNT_ID && process.env.NUXT_HUB_CLOUDFLARE_API_TOKEN
  const hasGatewayId = process.env.NUXT_HUB_CLOUDFLARE_GATEWAY_ID

  if (!hasCloudflareCreds) {
    throw createError({
      statusCode: 500,
      statusMessage:
        'AI binding not available. Set NUXT_HUB_CLOUDFLARE_ACCOUNT_ID, NUXT_HUB_CLOUDFLARE_API_TOKEN, and NUXT_HUB_CLOUDFLARE_GATEWAY_ID in .env.'
    })
  }
  if (!hasGatewayId) {
    throw createError({
      statusCode: 500,
      statusMessage: 'AI Gateway ID not configured. Add NUXT_HUB_CLOUDFLARE_GATEWAY_ID to your .env file.'
    })
  }
  throw createError({
    statusCode: 500,
    statusMessage:
      'AI binding not available. Ensure the Workers AI binding is configured in wrangler.jsonc for production.'
  })
}

export function resolveWorkersAiBinding(event?: {
  context?: { cloudflare?: { env?: { AI?: Ai } } }
  req?: { runtime?: { cloudflare?: { env?: { AI?: Ai } } } }
}): Ai | undefined {
  return resolveAiBinding(event as Parameters<typeof resolveAiBinding>[0]) as Ai | undefined
}
