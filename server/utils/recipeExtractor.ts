/**
 * Recipe extraction utility using AI vision models
 * Extracts recipe information from images
 */

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
    if (!gatewayId) {
      throw createError({
        statusCode: 500,
        statusMessage: 'AI Gateway ID not configured. For local development, you need to set up an AI Gateway in Cloudflare dashboard and add NUXT_HUB_CLOUDFLARE_GATEWAY_ID to your .env file. See SETUP_CLOUDFLARE_AI.md for instructions.'
      })
    }
    
    // Create a proxy object that mimics the AI binding API
    // This allows us to use the same code path for both local and production
    return {
      run: async (model: string, options: any) => {
        // Cloudflare AI Gateway endpoint for Workers AI
        // Format: https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/workers-ai/{model_id}
        const url = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/workers-ai/${model}`
        
        // Prepare request - Cloudflare API expects JSON
        const requestBody = JSON.stringify(options)
        
        // Prepare headers - check if gateway requires additional auth
        // If Authenticated Gateway is enabled, we need cf-aig-authorization header
        // See: https://developers.cloudflare.com/ai-gateway/configuration/authentication/
        const headers: Record<string, string> = {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
        
        // Add gateway auth token if provided (required when Authenticated Gateway is enabled)
        if (gatewayAuthToken) {
          headers['cf-aig-authorization'] = `Bearer ${gatewayAuthToken}`
        }
        
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: requestBody
        })
        
        if (!response.ok) {
          const errorText = await response.text()
          
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
              statusMessage: 'AI Gateway not properly configured. Please ensure: 1) You have created an AI Gateway in Cloudflare dashboard, 2) The gateway has "Workers AI" as a provider, 3) Your NUXT_HUB_CLOUDFLARE_GATEWAY_ID is correct (should be a UUID, not your Account ID). See SETUP_CLOUDFLARE_AI.md for detailed instructions.'
            })
          }
          
          if (response.status === 401 && (errorData.errors?.[0]?.code === 10000 || errorData.error?.[0]?.code === 10000)) {
            const hasGatewayAuth = !!gatewayAuthToken
            throw createError({
              statusCode: 401,
              statusMessage: `Authentication failed. ${hasGatewayAuth ? 'Gateway auth token provided but still failing.' : 'If your gateway has "Authenticated Gateway" enabled, you need to set NUXT_HUB_CLOUDFLARE_GATEWAY_AUTH_TOKEN in .env. '}Common causes: 1) Authenticated Gateway enabled but missing cf-aig-authorization header, 2) API token has IP filtering - use "All IP addresses" or add your public IP (not private IP), 3) API token has incorrect permissions - ensure "Workers AI: Read" and "AI Gateway: Read" are set, 4) Token is not scoped to the correct account, 5) Token may be expired or revoked. See SETUP_CLOUDFLARE_AI.md for troubleshooting.`
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
        
        const data = await response.json()
        
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
  let responseText: string
  if (typeof response === 'string') {
    responseText = response
  } else if (response?.result?.response) {
    responseText = response.result.response
  } else if (response?.response) {
    responseText = response.response
  } else if (response?.text) {
    responseText = response.text
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

  let braceCount = 0
  let jsonEndIndex = -1
  for (let i = 0; i < jsonText.length; i++) {
    if (jsonText[i] === '{') braceCount++
    if (jsonText[i] === '}') {
      braceCount--
      if (braceCount === 0) {
        jsonEndIndex = i + 1
        break
      }
    }
  }

  if (jsonEndIndex > 0 && jsonEndIndex < jsonText.length) {
    jsonText = jsonText.substring(0, jsonEndIndex)
  }

  try {
    return JSON.parse(jsonText)
  } catch {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0])
      } catch {
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
  const steps = parseMethodTextToSteps(String(transcript.methodText || ''))
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

  const titlePrompt = `You are an OCR assistant. This image is a crop of the top of a cookbook recipe page (title and any introduction).
Return JSON only with:
- title: recipe name as plain text (no markdown)
- description: short intro or empty string if none
- tags: array of short tags if visible, otherwise []
- servings: number only if clearly printed (omit if unknown)`

  const ingredientsPrompt = `You are an OCR assistant. This image shows only the INGREDIENTS list.
Return JSON only with ingredientsText: newline-separated lines, one ingredient per line, as printed.`

  const methodPrompt = `You are an OCR assistant. This image shows only the METHOD / cooking instructions.
Return JSON only with methodText: full instructions, newline-separated. Preserve 1. 2. step numbering if present.`

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

    let transcript: TranscribedRecipeText = {
      title: typeof titleData.title === 'string' ? titleData.title : '',
      description: typeof titleData.description === 'string' ? titleData.description : '',
      servings: typeof titleData.servings === 'number' ? titleData.servings : undefined,
      ingredientsText: typeof ingredientsData.ingredientsText === 'string' ? ingredientsData.ingredientsText : '',
      methodText: typeof methodData.methodText === 'string' ? methodData.methodText : '',
      tags: Array.isArray(titleData.tags) ? titleData.tags.filter((t): t is string => typeof t === 'string') : []
    }

    let structured = structureFromTranscript(transcript)
    let normalized = normalizeExtractedRecipe(structured)

    console.info('[extractRecipeFromRegionImages] summary', {
      ingredientLines: splitLines(String(transcript.ingredientsText || '')).length,
      methodBlocks: parseMethodTextToSteps(String(transcript.methodText || '')).length,
      ingredientCount: normalized.ingredients.length,
      stepCount: normalized.steps.length
    })

    if ((normalized.steps || []).filter(isMeaningfulStep).length === 0) {
      const methodRetry = await runVisionPrompt(
        ai,
        visionModel,
        `${methodPrompt}\nIf nothing is readable, return methodText as an empty string.`,
        methodUrl,
        { type: 'json_schema', json_schema: REGION_METHOD_SCHEMA },
        2600
      )
      const retryData = parseAiRecipeJson(methodRetry) as Record<string, unknown>
      if (typeof retryData.methodText === 'string' && retryData.methodText.trim()) {
        transcript = { ...transcript, methodText: retryData.methodText }
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
Return JSON only.
Read the image and extract:
- title (plain text, no markdown asterisks)
- short description/introduction text if present
- ingredientsText: one ingredient per line, including quantities and units as printed (e.g. 250 g green beans, not only "g green beans" if the number is visible)
- methodText: ALL text from the METHOD / instructions section only — not the ingredients list. On two-column pages, read the method column (often right-hand). Number each step as 1. 2. 3. if the book does, otherwise one paragraph per line; separate steps with newlines
- servings when visible
- tags as array if visible, otherwise []
Do not convert ingredients into structured fields yet; copy lines faithfully.`

  const ingredientsOnlyPrompt = `Extract only ingredient lines from this image.
Return JSON with keys: ingredientsText, title.
- ingredientsText must be newline-separated ingredient lines exactly as printed.
- title: short recipe title if visible at the top, else empty string.
- If nothing is readable, return ingredientsText as empty string.`

  const stepsOnlyPrompt = `Extract only cooking method / instructions from this image (ignore ingredients lists).
Return JSON with keys: methodText, title.
- methodText: every numbered or paragraph step, newline-separated. Preserve 1. 2. 3. prefixes if present.
- title: short recipe title if visible, else empty string.
- On two-column layouts, transcribe the method column in full.
- If nothing is readable, return methodText as empty string.`

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
    let structured = structureFromTranscript(transcribed)
    let normalized = normalizeExtractedRecipe(structured)

    console.info('[extractRecipeFromImage] transcript-first summary', {
      ingredientLines: splitLines(String(transcribed.ingredientsText || '')).length,
      methodBlocks: parseMethodTextToSteps(String(transcribed.methodText || '')).length,
      ingredientCount: normalized.ingredients.length,
      stepCount: normalized.steps.length
    })

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
        `Extract recipe fields from this image. Return JSON object with keys title, description, ingredients, steps, tags, servings.`,
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

  const deriveStepTitle = (rawTitle: unknown, rawContent: unknown, index: number): string => {
    const title = String(rawTitle || '').trim()
    const content = String(rawContent || '').trim()
    const isNumericTitle = /^(?:step\s*)?\d+[).:\-]*$/i.test(title)
    if (title && !isNumericTitle) {
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

  const normalized: ExtractedRecipe = {
    title: (typeof data.title === 'string' || typeof data.title === 'number') ? safeTrim(data.title) || undefined : undefined,
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
