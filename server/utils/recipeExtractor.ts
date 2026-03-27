/**
 * Recipe extraction utility using AI vision models
 * Extracts recipe information from images
 */

import { toRecipeTitleCase } from '~~/shared/utils/recipeTitle'

export interface ExtractedRecipe {
  title?: string
  description?: string
  ingredients: Array<{
    amount: string
    unit: string
    ingredientName: string
    notes?: string
  }>
  steps: Array<{
    title: string
    content: string
  }>
  tags?: string[]
  source?: string
  imageUrl?: string
  servings?: number
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

/** Coerce vision/JSON output to a trimmed string (avoids `x.trim is not a function` when the model returns a number or other non-string). */
const safeTrim = (value: unknown): string => String(value ?? '').trim()

/** Workers AI / gateway may return structured JSON in `result.response` (object) when using json_schema; normalise to a string for parsing. */
const coerceAiResponseToText = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const hasRecipeJsonShape = (o: Record<string, unknown>): boolean =>
  'ingredientsText' in o
  || 'methodText' in o
  || 'ingredients' in o
  || 'steps' in o
  || 'title' in o
  || 'description' in o
  || 'tags' in o

/**
 * After JSON.parse, unwrap Cloudflare Workers AI envelopes so recipe fields sit at top level.
 * JSON schema output is often `{ response: { ingredientsText, ... } }` (see Workers AI JSON mode docs);
 * we previously only unwrapped `result`, so region extraction saw empty strings.
 */
function unwrapAiJsonPayloadWithBranch(parsed: unknown): { value: unknown; branch: string } {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { value: parsed, branch: 'non-object' }
  }
  const o = parsed as Record<string, unknown>
  if (hasRecipeJsonShape(o)) return { value: o, branch: 'direct' }

  const resp = o.response
  if (resp != null && typeof resp === 'object' && !Array.isArray(resp)) {
    const r = resp as Record<string, unknown>
    if (hasRecipeJsonShape(r)) return { value: r, branch: 'response' }
  }

  const res = o.result
  if (res != null && typeof res === 'object' && !Array.isArray(res)) {
    const r = res as Record<string, unknown>
    if (hasRecipeJsonShape(r)) return { value: r, branch: 'result' }
    const nested = r.response
    if (nested != null && typeof nested === 'object' && !Array.isArray(nested)) {
      const deep = nested as Record<string, unknown>
      if (hasRecipeJsonShape(deep)) return { value: deep, branch: 'result.response' }
    }
  }
  return { value: parsed, branch: 'none' }
}

const unwrapAiJsonPayload = (parsed: unknown): unknown => unwrapAiJsonPayloadWithBranch(parsed).value

/**
 * First balanced `{ ... }` from the first `{`, respecting JSON string rules so `{`/`}` inside
 * ingredients/method text does not truncate the payload (naive brace counting breaks OCR JSON).
 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (c === '\\' && inString) {
      escape = true
      continue
    }
    if (c === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (c === '{') depth++
    if (c === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

function parseJsonSegmentLenient(segment: string): unknown {
  const s = segment.trim()
  try {
    return JSON.parse(s)
  } catch {
    const extracted = extractFirstJsonObject(s)
    if (extracted) {
      return JSON.parse(extracted)
    }
    throw new Error('parse failed')
  }
}

const pickStringField = (o: Record<string, unknown>, ...keys: string[]): string => {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string') return v
  }
  return ''
}

/** Workers AI sometimes returns one line per array element instead of a single newline-separated string. */
const coerceMultilineSchemaField = (v: unknown): string => {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).join('\n')
  return ''
}

/** When the model ignores JSON schema and returns markdown, extract title from common patterns. */
const extractTitleFromMarkdownProse = (text: string): string => {
  const t = text.trim()
  if (!t) return ''
  const bold = t.match(/\*\*Title\*\*\s*:\s*([^\n*]+)/i)
  if (bold?.[1]) return bold[1].trim()
  const bullet = t.match(/(?:^|\n)\s*\*?\s*\*?\*?Title\*?\*?\s*:\s*([^\n]+)/im)
  if (bullet?.[1]) return bullet[1].replace(/^\*+|\*+$/g, '').trim()
  return ''
}

/** Model sometimes uses section headings as title (e.g. "Recipe Information"); prefer real title from markdown. */
const sanitizeRegionTitle = (title: string, titleResponse: unknown): string => {
  let t = title.trim()
  if (!/^(recipe information|ingredients?|method|instructions?)$/i.test(t)) {
    return t
  }
  if (titleResponse && typeof titleResponse === 'object') {
    const tr = titleResponse as Record<string, unknown>
    if (typeof tr.response === 'string') {
      const fromMd = extractTitleFromMarkdownProse(tr.response)
      if (fromMd.trim()) return fromMd.trim()
    }
  }
  return ''
}

const looksLikeMethodJsonEnvelope = (t: string): boolean => {
  const x = t.trim()
  return x.startsWith('{') && /"methodText"\s*:/.test(x)
}

/**
 * When JSON.parse fails on the blob (invalid escapes, unescaped newlines, etc.), read the
 * `methodText` string value with a scanner so we never split `{ "methodText": "…" }` across steps.
 */
const extractMethodTextFromSloppyEnvelope = (t: string): string | null => {
  const s = t.trim()
  if (!s.startsWith('{')) return null
  const keyIdx = s.indexOf('"methodText"')
  if (keyIdx < 0) return null
  const afterKey = s.slice(keyIdx + '"methodText"'.length)
  const m = afterKey.match(/^\s*:\s*"/)
  if (!m) return null
  let i = keyIdx + '"methodText"'.length + m[0].length
  let out = ''
  let escape = false
  for (; i < s.length; i++) {
    const c = s[i]
    if (escape) {
      if (c === 'n') out += '\n'
      else if (c === 'r') out += '\r'
      else if (c === 't') out += '\t'
      else if (c === '\\') out += '\\'
      else if (c === '"') out += '"'
      else out += c
      escape = false
      continue
    }
    if (c === '\\') {
      escape = true
      continue
    }
    if (c === '"') {
      const tail = s.slice(i + 1).trim()
      if (tail === '}' || tail.startsWith('}')) return out.trim()
      return out.trim()
    }
    out += c
  }
  const trimmed = out.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Strip conversational preambles and duplicate JSON blobs from method region output so step parsing
 * does not turn "Sure, here is…" or nested `{"methodText":…}` into fake steps.
 */
const sanitizeTriRegionMethodText = (raw: string): string => {
  let s = raw.trim()
  if (!s) return ''

  /** Try every `{…}` slice in order — the first balanced object may not contain `methodText`. */
  const methodTextFromJsonBlob = (text: string): string | null => {
    let pos = 0
    while (pos < text.length) {
      const i = text.indexOf('{', pos)
      if (i < 0) break
      const slice = extractFirstJsonObject(text.slice(i))
      if (slice) {
        try {
          const p = JSON.parse(slice) as Record<string, unknown>
          const m = p.methodText
          if (typeof m === 'string' && m.trim()) return m.trim()
        } catch {
          /* try next { */
        }
      }
      pos = i + 1
    }
    return null
  }

  let out = methodTextFromJsonBlob(s)
  if (out) {
    return out
  }

  if (looksLikeMethodJsonEnvelope(s)) {
    const sloppy = extractMethodTextFromSloppyEnvelope(s)
    if (sloppy) {
      return sloppy
    }
  }

  const lines = s.split(/\r?\n/)
  let drop = 0
  while (drop < lines.length) {
    const L = (lines[drop] ?? '').trim()
    if (!L) {
      drop++
      continue
    }
    if (/^\d+\.\s/.test(L)) break
    if (/^\s*\{[\s\S]*"methodText"\s*:/.test(L) || (L.startsWith('{') && L.includes('methodText'))) break
    if (/^(sure|ok|okay|here|below|the image|the recipe|following|this is|i will|i'll|notes?|json)/i.test(L)) {
      drop++
      continue
    }
    if (/^(sure|okay|ok)[,.]?\s*(here|below|is|folks)/i.test(L)) {
      drop++
      continue
    }
    if (L.length < 200 && /json\s+format|step\s+numbering|as\s+requested|assistant|method\s+text\s+in/i.test(L)) {
      drop++
      continue
    }
    if (L.length < 90 && /^(please|below is|here is)/i.test(L)) {
      drop++
      continue
    }
    break
  }
  s = lines.slice(drop).join('\n').trim()
  out = methodTextFromJsonBlob(s)
  if (out) {
    return out
  }

  const numIdx = s.search(/\n\s*\d+\.\s/)
  if (numIdx > 0 && numIdx < 400) {
    s = s.slice(numIdx).trim()
    out = methodTextFromJsonBlob(s)
    if (out) return out
  }

  if (looksLikeMethodJsonEnvelope(s)) {
    const sloppy = extractMethodTextFromSloppyEnvelope(s)
    if (sloppy) {
      return sloppy
    }
  }

  return s.trim()
}

/** Region extraction expects `ingredientsText`; `parseTextResponse` fallback uses structured `ingredients`. */
const ingredientsTextFromRegionParsed = (data: Record<string, unknown>): string => {
  const direct = coerceMultilineSchemaField(data.ingredientsText ?? data.ingredients_text)
  if (direct.trim()) return direct
  const ing = data.ingredients
  if (Array.isArray(ing)) {
    return ing
      .map((item) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const x = item as Record<string, unknown>
          const parts = [x.amount, x.unit, x.ingredientName, x.notes].filter(
            (p): p is string => typeof p === 'string' && p.trim().length > 0
          )
          if (parts.length) return parts.join(' ')
        }
        return String(item ?? '')
      })
      .filter((line) => line.trim().length > 0)
      .join('\n')
  }
  return ''
}

const methodTextFromStepsArray = (steps: unknown): string => {
  if (!Array.isArray(steps)) return ''
  for (const s of steps) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) continue
    const x = s as Record<string, unknown>
    for (const field of [x.content, x.title]) {
      if (typeof field !== 'string' || !field.trim()) continue
      const blob = extractFirstJsonObject(field)
      if (!blob) continue
      try {
        const inner = JSON.parse(blob) as Record<string, unknown>
        const m = inner.methodText
        if (typeof m === 'string' && m.trim()) return m.trim()
      } catch {
        /* continue */
      }
    }
  }
  return ''
}

const isGarbageMethodStepLine = (title: string, content: string): boolean => {
  const t = title.trim()
  const c = content.trim()
  const combined = `${t}\n${c}`
  if (/^\s*\{/.test(t) || /"methodText"\s*:/.test(t)) return false
  if (/^(sure|okay|ok)[,.]?\s+(here|below)/i.test(combined) && combined.length < 220) return true
  if (/json\s+format|step\s+numbering/i.test(combined) && combined.length < 220) return true
  return false
}

const methodTextFromRegionParsed = (data: Record<string, unknown>): string => {
  const direct = coerceMultilineSchemaField(data.methodText ?? data.method_text)
  if (direct.trim()) return direct
  const fromBlobSteps = methodTextFromStepsArray(data.steps)
  if (fromBlobSteps.trim()) return fromBlobSteps
  const steps = data.steps
  if (Array.isArray(steps)) {
    return steps
      .map((s) => {
        if (s && typeof s === 'object' && !Array.isArray(s)) {
          const x = s as Record<string, unknown>
          const content = typeof x.content === 'string' ? x.content : ''
          const title = typeof x.title === 'string' ? x.title : ''
          if (isGarbageMethodStepLine(title, content)) return ''
          if (!content.trim()) return ''
          return title && !/^step\s*\d+/i.test(title) ? `${title}: ${content}` : content
        }
        return String(s ?? '')
      })
      .filter((line) => line.trim().length > 0)
      .join('\n')
  }
  return ''
}

/** When parseAiRecipeJson missed embedded JSON or the model returned prose only, recover from raw `ai.run` envelope. */
function resolveRegionTitleFromParsed(titleData: Record<string, unknown>, titleResponse: unknown): string {
  const fromParsed = pickStringField(titleData, 'title', 'recipe_title', 'name')
  if (fromParsed.trim()) return fromParsed
  if (titleResponse && typeof titleResponse === 'object') {
    const tr = titleResponse as Record<string, unknown>
    if (typeof tr.response === 'string') {
      const fromMd = extractTitleFromMarkdownProse(tr.response)
      if (fromMd) return fromMd
    }
  }
  return fromParsed
}

function resolveRegionMethodText(methodData: Record<string, unknown>, methodResponse: unknown): string {
  let text = methodTextFromRegionParsed(methodData)
  if (text.trim()) return sanitizeTriRegionMethodText(text)
  if (methodResponse && typeof methodResponse === 'object') {
    const mr = methodResponse as Record<string, unknown>
    if (typeof mr.response === 'string') {
      const s = mr.response.trim()
      const extracted = extractFirstJsonObject(s)
      if (extracted) {
        try {
          const inner = JSON.parse(extracted) as Record<string, unknown>
          text = coerceMultilineSchemaField(inner.methodText)
        } catch {
          /* ignore */
        }
      }
      if (!text.trim()) {
        const numIdx = s.search(/\n\s*\d+\.\s/)
        if (numIdx >= 0) {
          text = s.slice(numIdx).trim()
        } else if (s.length > 80) {
          text = s
        }
      }
    }
  }
  return sanitizeTriRegionMethodText(text)
}

/**
 * Extract recipe information from an image using AI vision model
 */
/**
 * Get AI client - works in both local dev (via API) and production (via binding)
 * In production (Nitro v3), use the Workers AI binding from the request: event.req.runtime.cloudflare.env.AI
 * For local dev, we create a proxy that calls Cloudflare API directly (or use process.env.AI if set)
 */
async function getAIClient(event?: any): Promise<any> {
  // Method 1: Request-scoped binding (production Cloudflare Workers / Nitro v3)
  const binding = event?.req?.runtime?.cloudflare?.env?.AI
  if (binding) {
    return binding
  }
  // Method 2: process.env.AI (fallback when event not passed or binding not on request)
  if ((process.env as any).AI) {
    return (process.env as any).AI
  }
  
  // Method 2: For local development, create AI client using Cloudflare AI Gateway API
  // This requires AI Gateway to be set up in Cloudflare dashboard
  const accountId = process.env.NUXT_HUB_CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.NUXT_HUB_CLOUDFLARE_API_TOKEN
  const gatewayId = process.env.NUXT_HUB_CLOUDFLARE_GATEWAY_ID
  const gatewayAuthToken = process.env.NUXT_HUB_CLOUDFLARE_GATEWAY_AUTH_TOKEN
  
  if (accountId && apiToken) {
    if (!gatewayId?.trim()) {
      throw createError({
        statusCode: 500,
        statusMessage: 'AI Gateway ID not configured. For local development, you need to set up an AI Gateway in Cloudflare dashboard and add NUXT_HUB_CLOUDFLARE_GATEWAY_ID to your .env file. See SETUP_CLOUDFLARE_AI.md for instructions.'
      })
    }

    // Cloudflare docs: {gateway_id} in the URL is the AI Gateway *name* (dashboard name when you created it), not a UUID.
    const gatewayIdForUrl = gatewayId.trim()
    
    // Create a proxy object that mimics the AI binding API
    // This allows us to use the same code path for both local and production
    return {
      run: async (model: string, options: any) => {
        // Cloudflare AI Gateway endpoint for Workers AI
        // Format: https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/workers-ai/{model_id}
        // {gateway_id} is the gateway name (same string as in the AI Gateway list / create flow), not a separate UUID field.
        // Model IDs may contain slashes (e.g. @cf/meta/...); Cloudflare docs show them unencoded in the path.
        const url = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayIdForUrl}/workers-ai/${model}`

        // Prepare request - Cloudflare API expects JSON
        const requestBody = JSON.stringify(options)
        
        // Prepare headers - check if gateway requires additional auth
        // If Authenticated Gateway is enabled, we need cf-aig-authorization header
        // See: https://developers.cloudflare.com/ai-gateway/configuration/authentication/
        const buildHeaders = (includeCfAig: boolean): Record<string, string> => {
          const h: Record<string, string> = {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          }
          if (includeCfAig && gatewayAuthToken) {
            h['cf-aig-authorization'] = `Bearer ${gatewayAuthToken}`
          }
          return h
        }

        const gatewayFetchAttempt = async (headers: Record<string, string>) => {
          const res = await fetch(url, { method: 'POST', headers, body: requestBody })
          const bodyText = await res.text()
          return { res, bodyText }
        }

        let result = await gatewayFetchAttempt(buildHeaders(true))
        if (!result.res.ok && result.res.status === 401 && gatewayAuthToken) {
          result = await gatewayFetchAttempt(buildHeaders(false))
        }
        if (!result.res.ok && result.res.status === 401 && gatewayAuthToken) {
          result = await gatewayFetchAttempt({
            'Authorization': `Bearer ${gatewayAuthToken}`,
            'Content-Type': 'application/json'
          })
        }

        const response = result.res

        if (!response.ok) {
          const errorText = result.bodyText

          let errorData: any
          try {
            errorData = JSON.parse(errorText)
          } catch {
            errorData = { message: errorText }
          }
          
          // Handle specific error codes
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
          
          // Handle specific error codes
          if (response.status === 400 && errorData.error?.[0]?.code === 2001) {
            throw createError({
              statusCode: 400,
              statusMessage: 'AI Gateway not properly configured. Please ensure: 1) You have created an AI Gateway in Cloudflare dashboard, 2) The gateway has "Workers AI" as a provider, 3) NUXT_HUB_CLOUDFLARE_GATEWAY_ID matches the gateway name (not your Account ID). See SETUP_CLOUDFLARE_AI.md for detailed instructions.'
            })
          }
          
          const gatewayErr = errorData.errors?.[0] || errorData.error?.[0]
          const gatewayErrCode = gatewayErr?.code
          if (response.status === 401 && (gatewayErrCode === 10000 || gatewayErrCode === 2009)) {
            const cfMsg = gatewayErr?.message || ''
            const hasGatewayAuth = !!gatewayAuthToken
            const detail = [
              cfMsg && `Cloudflare (${gatewayErrCode}): ${cfMsg}`,
              gatewayErrCode === 2009 && 'Code 2009 usually means the Cloudflare API token was rejected for this route. Create a token with Workers AI: Read and AI Gateway: Read, account scope, IP = all addresses.',
              hasGatewayAuth && 'If Authenticated Gateway is off, try removing NUXT_HUB_CLOUDFLARE_GATEWAY_AUTH_TOKEN (invalid cf-aig). The app also retries with the gateway token as Bearer if set.',
              'If Authenticated Gateway is on, use the gateway token from the AI Gateway dashboard for NUXT_HUB_CLOUDFLARE_GATEWAY_AUTH_TOKEN.'
            ].filter(Boolean).join(' ')
            throw createError({
              statusCode: 401,
              statusMessage: `Authentication failed. ${detail}`
            })
          }
          const dynamicErrorMessage = errorData.message || errorData.error?.[0]?.message || errorData.errors?.[0]?.message || errorText
          const normalizedDynamicErrorMessage = normalizeErrorDetail(dynamicErrorMessage, 'Unknown Cloudflare AI API error', 4000)
          
          throw createError({
            statusCode: response.status,
            statusMessage: 'Cloudflare AI API error',
            data: {
              detail: normalizedDynamicErrorMessage
            }
          })
        }
        
        const data = JSON.parse(result.bodyText)
        
        // Cloudflare API returns { result: { response: "..." } } or similar structure
        // Return the result in a format compatible with the binding API
        return data.result || data
      }
    }
  }
  
  // No AI available - provide helpful error
  const hasCloudflareCreds = process.env.NUXT_HUB_CLOUDFLARE_ACCOUNT_ID && process.env.NUXT_HUB_CLOUDFLARE_API_TOKEN
  const hasGatewayId = process.env.NUXT_HUB_CLOUDFLARE_GATEWAY_ID
  
  if (!hasCloudflareCreds) {
    throw createError({
      statusCode: 500,
      statusMessage: 'AI binding not available. For local development, ensure NUXT_HUB_CLOUDFLARE_ACCOUNT_ID, NUXT_HUB_CLOUDFLARE_API_TOKEN, and NUXT_HUB_CLOUDFLARE_GATEWAY_ID are set in .env. See SETUP_CLOUDFLARE_AI.md for instructions.'
    })
  } else if (!hasGatewayId) {
    throw createError({
      statusCode: 500,
      statusMessage: 'AI Gateway ID not configured. Set up an AI Gateway in Cloudflare dashboard and add NUXT_HUB_CLOUDFLARE_GATEWAY_ID to your .env file. See SETUP_CLOUDFLARE_AI.md for instructions.'
    })
  } else {
    throw createError({
      statusCode: 500,
      statusMessage: 'AI binding not available. Ensure ai: true is set in nuxt.config.ts hub config and restart your dev server. The AI binding may only be fully available in production (Cloudflare Workers).'
    })
  }
}

const normalizeImageMimeType = (imageMimeType?: string): string => {
  if (!imageMimeType) {
    return 'image/jpeg'
  }

  const normalized = imageMimeType.toLowerCase().trim()
  const allowedMimeTypes = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif'
  ])

  if (allowedMimeTypes.has(normalized)) {
    return normalized === 'image/jpg' ? 'image/jpeg' : normalized
  }

  return 'image/jpeg'
}

const EXTRACTION_SEED = 424242
const EXTRACTION_TEMPERATURE = 0.1
const EXTRACTION_TOP_P = 0.1

const RECIPE_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', maxLength: 240 },
    description: { type: 'string', maxLength: 5000 },
    servings: { type: 'number' },
    ingredients: {
      type: 'array',
      maxItems: 80,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          amount: { type: 'string', maxLength: 100 },
          unit: { type: 'string', maxLength: 60 },
          ingredientName: { type: 'string', maxLength: 240 },
          notes: { type: 'string', maxLength: 400 }
        },
        required: ['amount', 'unit', 'ingredientName', 'notes']
      }
    },
    steps: {
      type: 'array',
      maxItems: 60,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', maxLength: 200 },
          content: { type: 'string', maxLength: 4000 }
        },
        required: ['title', 'content']
      }
    },
    tags: {
      type: 'array',
      maxItems: 30,
      items: { type: 'string', maxLength: 80 }
    }
  },
  required: ['title', 'description', 'ingredients', 'steps', 'tags']
}

const parseAiRecipeJson = (response: any): ExtractedRecipe => {
  // Workers AI often returns { response: string | object, tool_calls, usage }. When `response` is a JSON
  // string, coerce→stringify→parse can fail (logs: no json match / regex path threw). Handle object/string first.
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    const r = response as Record<string, unknown>
    const inner = r.response
    if (inner != null && typeof inner === 'object' && !Array.isArray(inner)) {
      const ir = inner as Record<string, unknown>
      if (hasRecipeJsonShape(ir)) {
        const { value } = unwrapAiJsonPayloadWithBranch(inner)
        return value as ExtractedRecipe
      }
    }
    if (typeof inner === 'string') {
      const s = inner.trim()
      if (s.length > 0 && (s.startsWith('{') || s.startsWith('['))) {
        try {
          const parsed = parseJsonSegmentLenient(s)
          const { value } = unwrapAiJsonPayloadWithBranch(parsed)
          return value as ExtractedRecipe
        } catch {
          // fall through to legacy coercion + parse
        }
      }
    }
  }

  let responseText: string
  if (typeof response === 'string') {
    responseText = response
  } else if (response?.result?.response != null) {
    responseText = coerceAiResponseToText(response.result.response)
  } else if (
    response?.result != null
    && typeof response.result === 'object'
    && !Array.isArray(response.result)
  ) {
    // Cloudflare may return { result: { title, ... } } with no `response` envelope (JSON schema output).
    responseText = JSON.stringify(response.result)
  } else if (response?.response != null) {
    responseText = coerceAiResponseToText(response.response)
  } else if (response?.text != null) {
    responseText = coerceAiResponseToText(response.text)
  } else {
    responseText = JSON.stringify(response)
  }

  let jsonText = responseText.trim()
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '')
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '')
  }

  const jsonStartIndex = jsonText.indexOf('{')
  if (jsonStartIndex > 0) {
    jsonText = jsonText.substring(jsonStartIndex)
  }

  const finishUnwrap = (parsed: unknown): ExtractedRecipe => {
    const { value } = unwrapAiJsonPayloadWithBranch(parsed)
    return value as ExtractedRecipe
  }

  try {
    return finishUnwrap(parseJsonSegmentLenient(jsonText))
  } catch {
    const extracted = extractFirstJsonObject(responseText)
    if (extracted) {
      try {
        return finishUnwrap(parseJsonSegmentLenient(extracted))
      } catch {
        // fall through
      }
    }
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        return finishUnwrap(parseJsonSegmentLenient(jsonMatch[0]))
      } catch {
        const balanced = extractFirstJsonObject(responseText)
        if (balanced) {
          try {
            return finishUnwrap(parseJsonSegmentLenient(balanced))
          } catch {
            return parseTextResponse(responseText)
          }
        }
        return parseTextResponse(responseText)
      }
    }
    return parseTextResponse(responseText)
  }
}

const getIngredientAnomalyStats = (ingredients: ExtractedRecipe['ingredients']) => {
  const isBadName = (name: unknown) => {
    const n = safeTrim(name).toLowerCase()
    if (!n) return true
    if (!/[a-z]/i.test(n)) return true
    if (/^\(?see\s+pages?\s+\d+/i.test(n)) return true
    if (/^\(?see\s+page\s+\d+/i.test(n)) return true
    if (/^\(?page\s+\d+/i.test(n)) return true
    if (/^[().,\-/\d\s]+$/.test(n)) return true
    return false
  }

  const total = ingredients.length
  const bad = ingredients.filter(ing => isBadName(ing.ingredientName)).length
  const ratio = total > 0 ? bad / total : 0
  return { total, bad, ratio }
}

const shouldRunCorrectionPass = (recipe: ExtractedRecipe) => {
  const stats = getIngredientAnomalyStats(recipe.ingredients)
  if (stats.total < 2) return false
  return stats.ratio >= 0.25
}

const isMeaningfulStep = (step: { title: string; content: string }) => {
  const content = String(step.content || '').trim()
  return content.length >= 12
}

const getExtractionQualityScore = (recipe: ExtractedRecipe) => {
  const ingredientStats = getIngredientAnomalyStats(recipe.ingredients)
  const validIngredients = Math.max(ingredientStats.total - ingredientStats.bad, 0)
  const meaningfulSteps = (recipe.steps || []).filter(isMeaningfulStep).length
  const titleBonus = safeTrim(recipe.title) ? 1 : 0
  return {
    validIngredients,
    meaningfulSteps,
    total: validIngredients * 3 + meaningfulSteps * 2 + titleBonus
  }
}

const hasMeaningfulExtraction = (recipe: ExtractedRecipe) => {
  const quality = getExtractionQualityScore(recipe)
  const desc = safeTrim(recipe.description)
  const hasIntroOnlyContent = Boolean(safeTrim(recipe.title)) && desc.length >= 80
  return quality.validIngredients > 0 || quality.meaningfulSteps > 0 || hasIntroOnlyContent
}

interface TranscribedRecipeText {
  title?: string
  description?: string
  servings?: number
  ingredientsText?: string
  methodText?: string
  tags?: string[]
  source?: string
}

const TRANSCRIPTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', maxLength: 240 },
    description: { type: 'string', maxLength: 5000 },
    servings: { type: 'number' },
    ingredientsText: { type: 'string', maxLength: 12000 },
    methodText: { type: 'string', maxLength: 18000 },
    tags: { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 80 } }
  },
  required: ['title', 'description', 'ingredientsText', 'methodText', 'tags']
}

/** Narrow vision schemas for tri-region extraction (one image per region). */
const REGION_TITLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', maxLength: 240 },
    description: { type: 'string', maxLength: 5000 },
    servings: { type: 'number' },
    tags: { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 80 } }
  },
  required: ['title', 'description', 'tags']
}

const REGION_INGREDIENTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ingredientsText: { type: 'string', maxLength: 12000 }
  },
  required: ['ingredientsText']
}

const REGION_METHOD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    methodText: { type: 'string', maxLength: 18000 }
  },
  required: ['methodText']
}

const splitLines = (text: string) => text
  .split(/\r?\n/)
  .map(line => line.replace(/^[-*•\d.)\s]+/, '').trim())
  .filter(Boolean)

const UNIT_ALIASES: Record<string, string> = {
  g: 'grams',
  gram: 'grams',
  grams: 'grams',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  oz: 'oz',
  lb: 'lb',
  cup: 'cups',
  cups: 'cups',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  cloves: 'pieces',
  clove: 'pieces',
  pieces: 'pieces'
}

const canonicalUnitFromToken = (token: string) => {
  const key = token.trim().toLowerCase()
  return UNIT_ALIASES[key] || key
}

const splitNameAndCommaNotes = (rest: string) => {
  const pageRef = /\((?:page\s*)?\d+\)|\((?:see\s+)?pages?\s+\d+(?:[-–]\d+)?\)/gi
  const refs: string[] = []
  let working = rest.replace(pageRef, (m) => {
    refs.push(m.trim())
    return ' '
  })
  working = working.replace(/\s+/g, ' ').trim()

  const commaIdx = working.indexOf(',')
  if (commaIdx < 0) {
    return {
      ingredientName: working,
      notes: refs.join(', ')
    }
  }
  const ingredientName = working.slice(0, commaIdx).trim()
  const afterComma = working.slice(commaIdx + 1).trim()
  const notes = [afterComma, ...refs].filter(Boolean).join(', ').trim()
  return { ingredientName, notes }
}

/**
 * Parse a single OCR ingredient line into amount/unit/name/notes.
 * Handles cookbook layouts where the quantity is missing or merged with the unit (e.g. "g green beans").
 */
const parseIngredientLine = (line: string) => {
  let cleaned = line.replace(/\s+/g, ' ').trim()
  if (!cleaned) {
    return { amount: '', unit: 'pieces', ingredientName: '', notes: '' }
  }

  // Section headings (not ingredients)
  if (/^for\s+the\s+/i.test(cleaned) || /^method\b/i.test(cleaned)) {
    return { amount: '', unit: 'pieces', ingredientName: cleaned, notes: '' }
  }

  // --- Pattern: number + unit + rest (250 g beans, 2 tablespoons oil, 5 cm cinnamon)
  const numUnitRest = cleaned.match(
    /^([\d¼½¾/.\s-]+)\s*(g|kg|ml|l|oz|lb|cm|cups?|tbsp|tsp|tablespoons?|teaspoons?|grams?|cloves?)\s+(.+)$/i
  )
  if (numUnitRest) {
    const amount = numUnitRest[1].trim()
    const unit = canonicalUnitFromToken(numUnitRest[2])
    const { ingredientName, notes } = splitNameAndCommaNotes(numUnitRest[3].trim())
    return { amount, unit, ingredientName, notes }
  }

  // --- Pattern: leading unit without number (OCR dropped quantity): "g green beans, trimmed", "cm piece of cinnamon"
  const leadingUnit = cleaned.match(/^(g|kg|ml|l|oz|lb|cm)\s+(.+)$/i)
  if (leadingUnit) {
    const unit = canonicalUnitFromToken(leadingUnit[1])
    const { ingredientName, notes } = splitNameAndCommaNotes(leadingUnit[2].trim())
    return { amount: '', unit, ingredientName, notes }
  }

  // --- Pattern: leading count word (tablespoons/teaspoons) without or with number
  const spoonWord = cleaned.match(
    /^([\d¼½¾/.\s-]+)?\s*(tablespoons?|teaspoons?|tbsp|tsp)\s+(.+)$/i
  )
  if (spoonWord) {
    const amount = (spoonWord[1] || '').trim()
    const unit = canonicalUnitFromToken(spoonWord[2])
    const { ingredientName, notes } = splitNameAndCommaNotes(spoonWord[3].trim())
    return { amount, unit, ingredientName, notes }
  }

  // --- Fallback: legacy single-line regex (quantities stuck in amount field)
  const measurementMatch = cleaned.match(/^([\d¼½¾/.\s-]+)\s*(cups?|cup|tbsp|tsp|tablespoons?|teaspoons?|grams?|g|kg|oz|lb|ml|l|litres?|liters?|pieces?|cloves?)?\s*(.*)$/i)
  if (!measurementMatch) {
    return {
      amount: '',
      unit: 'pieces',
      ingredientName: cleaned,
      notes: ''
    }
  }

  const amount = (measurementMatch[1] || '').trim()
  const unitRaw = (measurementMatch[2] || '').trim().toLowerCase()
  const rest = (measurementMatch[3] || '').trim()

  const referenceMatch = rest.match(/\((?:see\s+)?pages?\s+\d+(?:[-–]\d+)?\)/i)
  const reference = referenceMatch ? referenceMatch[0] : ''
  const nameWithoutRef = reference ? rest.replace(reference, '').replace(/\s+/g, ' ').trim() : rest

  const commaIdx = nameWithoutRef.indexOf(',')
  const ingredientName = (commaIdx >= 0 ? nameWithoutRef.slice(0, commaIdx) : nameWithoutRef).trim()
  const trailingNotes = (commaIdx >= 0 ? nameWithoutRef.slice(commaIdx + 1) : '').trim()

  return {
    amount,
    unit: unitRaw ? canonicalUnitFromToken(unitRaw) : 'pieces',
    ingredientName,
    notes: [trailingNotes, reference].filter(Boolean).join(', ').trim()
  }
}

const parseMethodTextToSteps = (methodText: string) => {
  const raw = String(methodText || '').trim()
  if (!raw) {
    return []
  }

  // Split on numbered steps at line start or after newline
  let chunks = raw
    .split(/\n\s*(?=\d+[.)]\s+)/)
    .map((s) => s.trim())
    .filter(Boolean)

  if (chunks.length <= 1) {
    chunks = raw.split(/\s+(?=\d+[.)]\s+)/).map((s) => s.trim()).filter(Boolean)
  }

  if (chunks.length <= 1) {
    chunks = raw.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
  }

  const steps = chunks
    .map((chunk) => chunk.replace(/^\d+[.)]\s*/, '').trim())
    .filter((content) => content.length >= 8)

  return steps.map((content, index) => ({
    title: `Step ${index + 1}`,
    content
  }))
}

const structureFromTranscript = (transcript: TranscribedRecipeText): ExtractedRecipe => {
  const ingredientLines = splitLines(String(transcript.ingredientsText || ''))
  const ingredients = ingredientLines.map(parseIngredientLine).filter((ing) => ing.ingredientName)
  const methodPlain = sanitizeTriRegionMethodText(String(transcript.methodText || ''))
  const steps = parseMethodTextToSteps(methodPlain)
  const title = String(transcript.title || '')
    .replace(/\*\*/g, '')
    .trim()
  return {
    title,
    description: String(transcript.description || '').trim(),
    servings: transcript.servings,
    ingredients,
    steps,
    tags: Array.isArray(transcript.tags) ? transcript.tags : []
  }
}

const runVisionPrompt = async (ai: any, visionModel: string, prompt: string, imageDataUrl: string, responseFormat: any, maxTokens = 2200) => {
  return ai.run(visionModel, {
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageDataUrl } }
        ]
      }
    ],
    max_tokens: maxTokens,
    temperature: EXTRACTION_TEMPERATURE,
    top_p: EXTRACTION_TOP_P,
    seed: EXTRACTION_SEED,
    response_format: responseFormat
  })
}

/**
 * Extract from three pre-cropped images (title block, ingredients list, method).
 * Three focused vision calls; merged via the same transcript pipeline as full-page extraction.
 */
export async function extractRecipeFromRegionImages(
  titleBase64: string,
  ingredientsBase64: string,
  methodBase64: string,
  event?: any,
  titleMime?: string,
  ingredientsMime?: string,
  methodMime?: string
): Promise<ExtractedRecipe> {
  const ai = await getAIClient(event)
  const visionModel = '@cf/meta/llama-3.2-11b-vision-instruct'
  const titleMimeNorm = normalizeImageMimeType(titleMime)
  const ingredientsMimeNorm = normalizeImageMimeType(ingredientsMime)
  const methodMimeNorm = normalizeImageMimeType(methodMime)
  const titleUrl = `data:${titleMimeNorm};base64,${titleBase64}`
  const ingredientsUrl = `data:${ingredientsMimeNorm};base64,${ingredientsBase64}`
  const methodUrl = `data:${methodMimeNorm};base64,${methodBase64}`

  const titlePrompt = `OCR task: read the recipe title and any short introduction visible in this crop.

Output requirements (strict):
- Respond with ONLY a single JSON object matching the schema. No markdown, no bullet lists, no headings, no text before or after the JSON.
- title: the recipe name exactly as printed (plain text). Never use generic section labels such as "Recipe Information", "Ingredients", or "Method" as the title unless those words are literally the recipe name on the page.
- description: the introductory paragraph if present, otherwise "".
- tags: short strings or [].
- Do not wrap values in ** or *.`

  const ingredientsPrompt = `OCR task: read only the ingredient lines in this image.

Output requirements (strict):
- Respond with ONLY a single JSON object matching the schema. No commentary, no markdown, no text outside the JSON.
- ingredientsText must be a single string. Put each ingredient on its own line using newline characters inside that string (not an array of strings).
- Copy quantities and units as printed.`

  const methodPrompt = `OCR task: read only the cooking method / instructions in this image.

Output requirements (strict):
- Your entire reply must be ONLY one JSON object that matches the schema — nothing else. No assistant message, no markdown, no code fences, no text before or after the object.
- Do not write "Sure", "Here is", "Below is", "JSON format", or any similar phrase anywhere.
- methodText must be plain prose only: the recipe instructions as printed. Newlines between steps. Keep 1. 2. 3. prefixes if the book uses them.
- methodText must NOT contain another JSON object, escaped JSON, or the words schema or methodText inside the string — only the actual cooking steps.`

  try {
    try {
      await ai.run(visionModel, {
        messages: [{ role: 'user', content: 'agree' }]
      })
    } catch {
      // ignore
    }

    const [titleResponse, ingredientsResponse, methodResponse] = await Promise.all([
      runVisionPrompt(ai, visionModel, titlePrompt, titleUrl, { type: 'json_schema', json_schema: REGION_TITLE_SCHEMA }, 2000),
      runVisionPrompt(ai, visionModel, ingredientsPrompt, ingredientsUrl, { type: 'json_schema', json_schema: REGION_INGREDIENTS_SCHEMA }, 2400),
      runVisionPrompt(ai, visionModel, methodPrompt, methodUrl, { type: 'json_schema', json_schema: REGION_METHOD_SCHEMA }, 2600)
    ])

    const titleData = parseAiRecipeJson(titleResponse) as Record<string, unknown>
    const ingredientsData = parseAiRecipeJson(ingredientsResponse) as Record<string, unknown>
    const methodData = parseAiRecipeJson(methodResponse) as Record<string, unknown>

    const resolvedTitle = resolveRegionTitleFromParsed(titleData, titleResponse)
    let titleForTranscript = sanitizeRegionTitle(resolvedTitle, titleResponse)
    if (
      !titleForTranscript.trim()
      && resolvedTitle.trim()
      && !/^(recipe information|ingredients?|method|instructions?)$/i.test(resolvedTitle.trim())
    ) {
      titleForTranscript = resolvedTitle.trim()
    }

    let transcript: TranscribedRecipeText = {
      title: titleForTranscript,
      description: pickStringField(titleData, 'description', 'intro', 'introduction'),
      servings: typeof titleData.servings === 'number' ? titleData.servings : undefined,
      ingredientsText: ingredientsTextFromRegionParsed(ingredientsData),
      methodText: resolveRegionMethodText(methodData, methodResponse),
      tags: Array.isArray(titleData.tags) ? titleData.tags.filter((t): t is string => typeof t === 'string') : []
    }

    let structured = structureFromTranscript(transcript)
    let normalized = normalizeExtractedRecipe(structured)

    if ((normalized.steps || []).filter(isMeaningfulStep).length === 0) {
      const methodRetry = await runVisionPrompt(
        ai,
        visionModel,
        `${methodPrompt}\nIf nothing is readable, return exactly {"methodText":""} with no other keys or text.`,
        methodUrl,
        { type: 'json_schema', json_schema: REGION_METHOD_SCHEMA },
        2600
      )
      const retryData = parseAiRecipeJson(methodRetry) as Record<string, unknown>
      const retryMethod = resolveRegionMethodText(retryData, methodRetry)
      if (retryMethod.trim()) {
        transcript = { ...transcript, methodText: retryMethod }
        structured = structureFromTranscript(transcript)
        normalized = normalizeExtractedRecipe(structured)
      }
    }

    if (!hasMeaningfulExtraction(normalized)) {
      throw createError({
        statusCode: 422,
        statusMessage: 'No extractable recipe content found in this image.',
        data: {
          detail: 'AI could not confidently read one or more regions. Try tighter crops with even lighting.'
        }
      })
    }

    return normalized
  } catch (error: any) {
    if (error?.statusCode === 422 || error?.statusCode === 429 || error?.statusCode === 402) {
      throw error
    }
    const originalErrorDetail = normalizeErrorDetail(
      error?.data?.detail || error?.statusMessage || error?.message,
      'Unknown error',
      4000
    )
    throw createError({
      statusCode: Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500,
      statusMessage: 'Failed to extract recipe',
      data: { detail: originalErrorDetail }
    })
  }
}

export async function extractRecipeFromImage(imageBase64: string, event?: any, imageMimeType?: string): Promise<ExtractedRecipe> {
  const ai = await getAIClient(event)
  const normalizedMimeType = normalizeImageMimeType(imageMimeType)
  const imageDataUrl = `data:${normalizedMimeType};base64,${imageBase64}`
  const visionModel = '@cf/meta/llama-3.2-11b-vision-instruct'

  const transcriptionPrompt = `You are an OCR recipe transcription assistant for cookbook pages.
Return ONLY one JSON object matching the schema — no markdown, no commentary, no text outside the JSON.
Read the image and extract:
- title (plain text, no markdown asterisks)
- short description/introduction text if present
- ingredientsText: one ingredient per line, including quantities and units as printed (e.g. 250 g green beans, not only "g green beans" if the number is visible)
- methodText: ALL text from the METHOD / instructions section only — not the ingredients list. Plain prose with newlines between steps; no nested JSON, no "Sure/Here is", no schema repetition. On two-column pages, read the method column (often right-hand). Number each step as 1. 2. 3. if the book does, otherwise one paragraph per line; separate steps with newlines
- servings when visible
- tags as array if visible, otherwise []
Do not convert ingredients into structured fields yet; copy lines faithfully.`

  const ingredientsOnlyPrompt = `Extract only ingredient lines from this image.
Return JSON with keys: ingredientsText, title.
- ingredientsText must be newline-separated ingredient lines exactly as printed.
- title: short recipe title if visible at the top, else empty string.
- If nothing is readable, return ingredientsText as empty string.`

  const stepsOnlyPrompt = `Extract only cooking method / instructions from this image (ignore ingredients lists).
Return ONLY one JSON object with keys methodText and title — no preamble, no markdown, no assistant wording.
- methodText: plain prose only — every numbered or paragraph step, newline-separated. Preserve 1. 2. 3. prefixes if present. Do not put JSON, schema text, or phrases like "Sure" or "Here is" inside methodText.
- title: short recipe title if visible, else empty string.
- On two-column layouts, transcribe the method column in full.
- If nothing is readable, return exactly {"methodText":"","title":""}.`

  try {
    try {
      await ai.run(visionModel, {
        messages: [{ role: 'user', content: 'agree' }]
      })
    } catch {
      // ignore: agreement may already be accepted
    }

    const transcriptionResponse = await runVisionPrompt(
      ai,
      visionModel,
      transcriptionPrompt,
      imageDataUrl,
      { type: 'json_schema', json_schema: TRANSCRIPTION_SCHEMA },
      2600
    )

    const transcribed = parseAiRecipeJson(transcriptionResponse) as TranscribedRecipeText
    transcribed.methodText = sanitizeTriRegionMethodText(String(transcribed.methodText || ''))
    let structured = structureFromTranscript(transcribed)
    let normalized = normalizeExtractedRecipe(structured)

    // Ingredients present but no method: common on two-column scans — run a focused steps pass.
    {
      const meaningfulStepCount = (normalized.steps || []).filter(isMeaningfulStep).length
      if (normalized.ingredients.length > 0 && meaningfulStepCount === 0) {
        const stepsRetry = await runVisionPrompt(
          ai,
          visionModel,
          stepsOnlyPrompt,
          imageDataUrl,
          {
            type: 'json_schema',
            json_schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                title: { type: 'string', maxLength: 240 },
                methodText: { type: 'string', maxLength: 18000 }
              },
              required: ['methodText', 'title']
            }
          },
          1800
        )
        const sData = parseAiRecipeJson(stepsRetry) as TranscribedRecipeText
        sData.methodText = sanitizeTriRegionMethodText(String(sData.methodText || ''))
        const mergedSteps = parseMethodTextToSteps(String(sData.methodText || ''))
        if (mergedSteps.filter(isMeaningfulStep).length > 0) {
          structured = {
            ...structured,
            title: structured.title || String(sData.title || '').replace(/\*\*/g, '').trim(),
            steps: mergedSteps
          }
          normalized = normalizeExtractedRecipe(structured)
        }
      }
    }

    if (!hasMeaningfulExtraction(normalized)) {
      const ingredientsRetry = await runVisionPrompt(
        ai,
        visionModel,
        ingredientsOnlyPrompt,
        imageDataUrl,
        {
          type: 'json_schema',
          json_schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string', maxLength: 240 },
              ingredientsText: { type: 'string', maxLength: 12000 }
            },
            required: ['ingredientsText', 'title']
          }
        },
        1800
      )
      const iData = parseAiRecipeJson(ingredientsRetry) as TranscribedRecipeText
      structured = {
        ...structured,
        title: structured.title || iData.title,
        ingredients: splitLines(String(iData.ingredientsText || '')).map(parseIngredientLine)
      }
      normalized = normalizeExtractedRecipe(structured)
    }

    if (!hasMeaningfulExtraction(normalized)) {
      const stepsRetry = await runVisionPrompt(
        ai,
        visionModel,
        stepsOnlyPrompt,
        imageDataUrl,
        {
          type: 'json_schema',
          json_schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string', maxLength: 240 },
              methodText: { type: 'string', maxLength: 18000 }
            },
            required: ['methodText', 'title']
          }
        },
        1800
      )
      const sData = parseAiRecipeJson(stepsRetry) as TranscribedRecipeText
      sData.methodText = sanitizeTriRegionMethodText(String(sData.methodText || ''))
      structured = {
        ...structured,
        title: structured.title || sData.title,
        steps: parseMethodTextToSteps(String(sData.methodText || ''))
      }
      normalized = normalizeExtractedRecipe(structured)
    }

    if (!hasMeaningfulExtraction(normalized)) {
      // Last-chance retry with looser JSON object response.
      const fallbackStructuredResponse = await runVisionPrompt(
        ai,
        visionModel,
        `Extract recipe fields from this image. Return ONLY a JSON object with keys title, description, ingredients, steps, tags, servings. No assistant preamble. For steps use plain instruction text in each step's content — not nested JSON or meta-commentary.`,
        imageDataUrl,
        { type: 'json_object' },
        2200
      )
      const fallbackStructured = parseAiRecipeJson(fallbackStructuredResponse)
      const fallbackNormalized = normalizeExtractedRecipe(fallbackStructured)
      if (getExtractionQualityScore(fallbackNormalized).total > getExtractionQualityScore(normalized).total) {
        normalized = fallbackNormalized
      }
    }

    if (shouldRunCorrectionPass(normalized)) {
      try {
        const correctionPrompt = `Repair this extracted recipe JSON so ingredient fields are consistent.
Return only corrected JSON with the same schema keys.
Rules:
- ingredientName must not contain page references (e.g. see page 25)
- amount should contain quantity only when possible
- unit should be canonical (cups, tbsp, tsp, grams, kg, oz, lb, ml, l, pieces)
- notes should carry references/preparation/extra qualifiers
- keep original meaning and ordering
JSON to repair:
${JSON.stringify(normalized)}`

        const correctionResponse = await ai.run(visionModel, {
          messages: [{ role: 'user', content: correctionPrompt }],
          max_tokens: 1800,
          temperature: EXTRACTION_TEMPERATURE,
          top_p: EXTRACTION_TOP_P,
          seed: EXTRACTION_SEED,
          response_format: {
            type: 'json_schema',
            json_schema: RECIPE_RESPONSE_SCHEMA
          }
        })

        const corrected = parseAiRecipeJson(correctionResponse)
        const correctedNormalized = normalizeExtractedRecipe(corrected)
        const baseScore = getExtractionQualityScore(normalized)
        const correctedScore = getExtractionQualityScore(correctedNormalized)
        if (correctedScore.total > baseScore.total) {
          normalized = correctedNormalized
        }
      } catch {
        // keep existing output
      }
    }

    if (!hasMeaningfulExtraction(normalized)) {
      throw createError({
        statusCode: 422,
        statusMessage: 'No extractable recipe content found in this image.',
        data: {
          detail: 'AI could not confidently extract ingredients or steps. Try scanning ingredients and method separately (two crops), with flat framing and even lighting.'
        }
      })
    }

    return normalized
  } catch (error: any) {
    const originalErrorDetail = normalizeErrorDetail(
      error?.data?.detail || error?.statusMessage || error?.message,
      'Unknown error',
      4000
    )

    if (error.statusCode === 429) {
      throw createError({ statusCode: 429, statusMessage: 'AI rate limit exceeded. Please try again later.' })
    }
    if (error.statusCode === 402) {
      throw createError({ statusCode: 402, statusMessage: 'AI quota exceeded. Please check your plan limits.' })
    }
    if (error.statusCode === 422) {
      throw createError({
        statusCode: 422,
        statusMessage: error.statusMessage || 'No extractable recipe content found in this image.',
        data: {
          detail: error?.data?.detail || 'AI could not confidently extract ingredients or steps from this image.'
        }
      })
    }

    const statusCode = Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 600
      ? error.statusCode
      : 500

    throw createError({
      statusCode,
      statusMessage: 'Failed to extract recipe',
      data: { detail: originalErrorDetail }
    })
  }
}

/**
 * Fallback parser for text responses that aren't valid JSON
 */
function parseTextResponse(text: string): ExtractedRecipe {
  const result: ExtractedRecipe = {
    ingredients: [],
    steps: []
  }

  // Try to find JSON object in markdown or text
  // Look for JSON code blocks first
  const jsonBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i)
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1])
      return normalizeExtractedRecipe(parsed)
    } catch {
      // Continue to other methods
    }
  }

  // Try to extract title from various formats
  const titlePatterns = [
    /(?:title|name)[:\s]+["']?([^"'\n]+)["']?/i,
    /#\s+(.+)/, // Markdown heading
    /\*\*([^*]+)\*\*/, // Bold text
    /Recipe[:\s]+(.+?)(?:\n|$)/i
  ]
  
  for (const pattern of titlePatterns) {
    const match = text.match(pattern)
    if (match && match[1] && match[1].trim().length > 0 && match[1].trim().length < 100) {
      result.title = match[1].trim()
      break
    }
  }

  // Try to extract ingredients - look for JSON array format
  const ingredientsPatterns = [
    /"ingredients"\s*:\s*\[([^\]]+)\]/is,
    /ingredients?[:\s]*\[([^\]]+)\]/is,
    /ingredients?[:\s]*\n\s*\[([^\]]+)\]/is
  ]
  
  for (const pattern of ingredientsPatterns) {
    const match = text.match(pattern)
    if (match) {
      try {
        const ingredientsJson = `[${match[1]}]`
        const parsed = JSON.parse(ingredientsJson)
        if (Array.isArray(parsed)) {
          result.ingredients = parsed
          break
        }
      } catch {
        // Try next pattern
      }
    }
  }

  // Try to extract steps - look for JSON array format
  const stepsPatterns = [
    /"steps"\s*:\s*\[([^\]]+)\]/is,
    /steps?[:\s]*\[([^\]]+)\]/is,
    /steps?[:\s]*\n\s*\[([^\]]+)\]/is
  ]
  
  for (const pattern of stepsPatterns) {
    const match = text.match(pattern)
    if (match) {
      try {
        const stepsJson = `[${match[1]}]`
        const parsed = JSON.parse(stepsJson)
        if (Array.isArray(parsed)) {
          result.steps = parsed
          break
        }
      } catch {
        // Try next pattern
      }
    }
  }

  return result
}

/**
 * Normalize and validate extracted recipe data
 */
function normalizeExtractedRecipe(data: any): ExtractedRecipe {
  const unitMap: Record<string, string> = {
    g: 'grams',
    gram: 'grams',
    grams: 'grams',
    kg: 'kg',
    kilogram: 'kg',
    kilograms: 'kg',
    oz: 'oz',
    ounce: 'oz',
    ounces: 'oz',
    lb: 'lb',
    pound: 'lb',
    pounds: 'lb',
    ml: 'ml',
    milliliter: 'ml',
    milliliters: 'ml',
    cm: 'cm',
    l: 'l',
    litre: 'l',
    litres: 'l',
    liter: 'l',
    liters: 'l',
    tbsp: 'tbsp',
    tablespoon: 'tbsp',
    tablespoons: 'tbsp',
    tsp: 'tsp',
    teaspoon: 'tsp',
    teaspoons: 'tsp',
    cup: 'cups',
    cups: 'cups',
    piece: 'pieces',
    pieces: 'pieces',
    clove: 'pieces',
    cloves: 'pieces'
  }
  const prepWords = ['chopped', 'diced', 'sliced', 'minced', 'fresh', 'dried', 'roughly', 'finely', 'grated', 'crushed', 'optional']
  const appendNote = (a?: unknown, b?: unknown) =>
    [a, b].filter((x) => x !== undefined && x !== null && String(x).trim() !== '')
      .map((x) => String(x).trim())
      .join(', ')
      .replace(/\s+/g, ' ')
      .trim()
  const canonicalizeUnit = (value: unknown) => {
    const v = safeTrim(value).toLowerCase()
    return unitMap[v] || v
  }
  const hasLetters = (value: string) => /[a-z]/i.test(value)
  const isBadIngredientName = (value: unknown) => {
    const name = safeTrim(value)
    if (!name || !hasLetters(name)) return true
    if (/^\(?see\s+pages?\s+\d+/i.test(name)) return true
    if (/^\(?page\s+\d+/i.test(name)) return true
    if (/^[().,\-/\d\s]+$/.test(name)) return true
    return false
  }
  const moveReferenceTokensToNotes = (name: unknown, notes?: unknown) => {
    const nameStr = safeTrim(name)
    const referenceMatch = nameStr.match(/\((?:see\s+)?pages?\s+\d+(?:[-–]\d+)?\)/i) || nameStr.match(/\((?:see\s+)?page\s+\d+\)/i)
    if (!referenceMatch) return { name: nameStr, notes: notes === undefined || notes === null ? undefined : safeTrim(notes) }
    const cleanedName = nameStr.replace(referenceMatch[0], '').replace(/\s+/g, ' ').trim().replace(/,$/, '')
    return { name: cleanedName, notes: appendNote(notes, referenceMatch[0]) }
  }
  const movePrepTokensToNotes = (name: unknown, notes?: unknown) => {
    let cleaned = safeTrim(name)
    const found: string[] = []
    for (const prep of prepWords) {
      const re = new RegExp(`\\b${prep}\\b`, 'gi')
      if (re.test(cleaned)) {
        found.push(prep)
        cleaned = cleaned.replace(re, ' ')
      }
    }
    cleaned = cleaned.replace(/\s+/g, ' ').trim().replace(/^[,.\-]+|[,.\-]+$/g, '')
    return {
      name: cleaned,
      notes: found.length ? appendNote(notes, found.join(' ')) : (notes === undefined || notes === null ? undefined : safeTrim(notes))
    }
  }
  const normaliseAmountAndUnit = (rawAmount: unknown, rawUnit: unknown, rawName: unknown, rawNotes?: unknown) => {
    let amount = safeTrim(rawAmount)
    let unit = canonicalizeUnit(rawUnit || '')
    let ingredientName = safeTrim(rawName)
    let notes = rawNotes === undefined || rawNotes === null ? undefined : safeTrim(rawNotes)

    const splitAmount = amount.match(/^([\d./\s-]+)\s*(g|kg|oz|lb|ml|l|cups?|tbsp|tsp|teaspoons?|tablespoons?)\b(?:\s*\/\s*([^,]+))?/i)
    if (splitAmount) {
      amount = splitAmount[1].trim()
      unit = canonicalizeUnit(splitAmount[2])
      if (splitAmount[3]) {
        notes = appendNote(notes, splitAmount[3].trim())
      }
    }

    const amountWithWordUnit = amount.match(/^([\d./\s-]+)\s+([a-zA-Z]+)$/)
    if (amountWithWordUnit && (!unit || unit === 'pieces')) {
      amount = amountWithWordUnit[1].trim()
      unit = canonicalizeUnit(amountWithWordUnit[2])
    }

    if (unit.includes('/') && hasLetters(unit)) {
      const parts = unit.split('/')
      unit = canonicalizeUnit(parts[0] || '')
      notes = appendNote(notes, parts.slice(1).join('/').trim())
    }

    const rawUnitStr = String(rawUnit ?? '')
    if (/cloves?/i.test(rawUnitStr) && (isBadIngredientName(ingredientName) || prepWords.includes(ingredientName.toLowerCase()))) {
      const maybeName = rawUnitStr.replace(/cloves?/ig, '').trim()
      if (maybeName) {
        notes = appendNote(notes, ingredientName)
        ingredientName = maybeName
      }
      unit = 'pieces'
    }

    if (!unit) {
      unit = 'pieces'
    }

    return { amount, unit, ingredientName, notes }
  }
  const repairIngredientFields = (ing: any) => {
    let amount = String(ing.amount ?? ing.quantity ?? '').trim()
    let unit = String(ing.unit ?? '').trim()
    let ingredientName = String(ing.ingredientName ?? ing.name ?? ing.ingredient ?? '').trim()
    let notes = ing.notes === undefined || ing.notes === null ? undefined : safeTrim(ing.notes)

    const normalized = normaliseAmountAndUnit(amount, unit, ingredientName, notes)
    amount = normalized.amount
    unit = normalized.unit
    ingredientName = normalized.ingredientName
    notes = normalized.notes

    const withRefs = moveReferenceTokensToNotes(ingredientName, notes)
    ingredientName = withRefs.name
    notes = withRefs.notes

    const withPrep = movePrepTokensToNotes(ingredientName, notes)
    ingredientName = withPrep.name
    notes = withPrep.notes

    if (isBadIngredientName(ingredientName)) {
      if (!notes) notes = ingredientName
      ingredientName = ''
    }

    return { amount, unit: canonicalizeUnit(unit) || 'pieces', ingredientName, notes }
  }

  const isGarbageStepTitle = (t: string) => {
    const s = t.trim()
    if (!s) return false
    if (/^\s*\{/.test(s)) return true
    if (/["']methodText["']\s*:/.test(s)) return true
    if (/^(sure|okay|ok)[,.]?\s+(here|below)/i.test(s)) return true
    return false
  }

  const deriveStepTitle = (rawTitle: unknown, rawContent: unknown, index: number): string => {
    const title = String(rawTitle || '').trim()
    const content = String(rawContent || '').trim()
    const isNumericTitle = /^(?:step\s*)?\d+[).:\-]*$/i.test(title)
    if (title && !isNumericTitle && !isGarbageStepTitle(title)) {
      return title
    }

    const cleaned = content
      .replace(/^\s*(?:step\s*)?\d+[).:\-]*\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim()

    if (!cleaned) {
      return `Step ${index + 1}`
    }

    const firstSentence = cleaned.split(/[.!?]/)[0]?.trim() || cleaned
    const words = firstSentence.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      return `Step ${index + 1}`
    }

    const trimmedWords = words.slice(0, 6)
    const firstWord = trimmedWords[0]
    if (firstWord) {
      trimmedWords[0] = firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase()
    }

    const candidate = trimmedWords.join(' ').replace(/[,:;]+$/, '').trim()
    return candidate || `Step ${index + 1}`
  }

  // Extract and round down servings
  let servings: number | undefined = undefined
  if (data.servings !== undefined && data.servings !== null) {
    const servingsValue = typeof data.servings === 'string' ? parseInt(data.servings, 10) : data.servings
    if (!isNaN(servingsValue) && servingsValue > 0) {
      servings = Math.floor(servingsValue)
    }
  }

  const rawTitleForNorm =
    typeof data.title === 'string' || typeof data.title === 'number' ? safeTrim(data.title) : ''
  const normalized: ExtractedRecipe = {
    title: rawTitleForNorm ? toRecipeTitleCase(rawTitleForNorm) : undefined,
    description: (typeof data.description === 'string' || typeof data.description === 'number') ? safeTrim(data.description) || undefined : undefined,
    servings,
    ingredients: [],
    steps: [],
    tags: Array.isArray(data.tags) ? data.tags.filter((t: any) => typeof t === 'string') : [],
    imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl.trim() : undefined
  }

  // Normalize ingredients
  if (Array.isArray(data.ingredients)) {
    normalized.ingredients = data.ingredients
      .filter((ing: any) => ing && typeof ing === 'object')
      .map((ing: any) => repairIngredientFields(ing))
      .filter((ing: any) => ing.ingredientName) // Only keep ingredients with names
  }

  // Normalize steps
  if (Array.isArray(data.steps)) {
    normalized.steps = data.steps
      .filter((step: any) => step && typeof step === 'object')
      .map((step: any, index: number) => {
        const content = String(step.content || step.text || step.instruction || '').trim()
        return {
          title: deriveStepTitle(step.title, content, index),
          content
        }
      })
      .filter((step: any) => step.content) // Only keep steps with content
  } else if (Array.isArray(data.instructions)) {
    // Handle alternative field name
    normalized.steps = data.instructions
      .filter((step: any) => step && typeof step === 'object')
      .map((step: any, index: number) => {
        const content = String(step.content || step.text || step.instruction || step).trim()
        return {
          title: deriveStepTitle(step.title, content, index),
          content
        }
      })
      .filter((step: any) => step.content)
  }

  return normalized
}

/**
 * Extract recipe from URL (for future use)
 * This would fetch the webpage, extract text, and use AI to parse
 */
export async function extractRecipeFromURL(url: string): Promise<ExtractedRecipe> {
  // TODO: Implement URL extraction
  // 1. Fetch webpage content
  // 2. Extract text content (remove HTML)
  // 3. Use AI text model to parse recipe information
  // 4. Return structured data
  
  throw createError({
    statusCode: 501,
    statusMessage: 'URL extraction not yet implemented'
  })
}
