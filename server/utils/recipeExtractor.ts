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
    },
    source: { type: 'string', maxLength: 500 }
  },
  required: ['title', 'description', 'ingredients', 'steps', 'tags', 'source']
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
  const isBadName = (name: string) => {
    const n = name.trim().toLowerCase()
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
  const titleBonus = recipe.title?.trim() ? 1 : 0
  return {
    validIngredients,
    meaningfulSteps,
    total: validIngredients * 3 + meaningfulSteps * 2 + titleBonus
  }
}

const hasMeaningfulExtraction = (recipe: ExtractedRecipe) => {
  const quality = getExtractionQualityScore(recipe)
  return quality.validIngredients > 0 || quality.meaningfulSteps > 0
}

export async function extractRecipeFromImage(imageBase64: string, event?: any, imageMimeType?: string): Promise<ExtractedRecipe> {
  // Get AI client (binding when event provided in production, else gateway/token for local)
  const ai = await getAIClient(event)
  const normalizedMimeType = normalizeImageMimeType(imageMimeType)

  // Create a detailed prompt for recipe extraction
  // IMPORTANT: The prompt must explicitly instruct the model to analyze the IMAGE
  const prompt = `You are extracting a recipe from ONE image.
Return JSON only. No markdown. No code fences.

WORKFLOW (must follow):
Phase A) Read and transcribe visible ingredient lines and step text mentally.
Phase B) Convert those lines into the schema fields.

FIELD MAPPING RULES FOR INGREDIENTS:
- amount: numeric quantity only when possible (e.g. "250", "1/2", "2.5")
- unit: canonical short unit when clear: cups, tbsp, tsp, grams, kg, oz, lb, ml, l, pieces
- ingredientName: ingredient itself only (never page references, never pure prep words)
- notes: leftovers such as dual units, references, prep info, qualifiers
- For "250 g/9 oz rice noodles": amount="250", unit="grams", ingredientName="rice noodles", notes includes "9 oz"
- For "(see page 25)": put in notes, never ingredientName
- For prep text (chopped, roughly, fresh): move to notes
- If an ingredient title is ambiguous, prefer preserving uncertainty in notes, not in ingredientName

STEP RULES:
- content contains full instruction text
- title is concise and meaningful
- if no explicit title exists, infer from instruction content (never numeric-only titles)

GENERAL RULES:
- Extract only what is visible
- Keep source order
- Keep all top-level keys present
- If unknown: use empty string/empty array
- servings can be omitted or set to 0 when unknown; for ranges use the lower integer`

  try {
    // Use a vision-capable model
    // Note: Cloudflare Workers AI API format may vary
    // Check Workers AI documentation for the correct format for vision models
    // For now, we'll use a format that should work with most models
    
    let response: any
    
    // Use vision-capable model - required for image processing
    // Note: @cf/meta/llama-3.1-8b-instruct doesn't support vision and will ignore images
    const visionModel = '@cf/meta/llama-3.2-11b-vision-instruct'
    
    // First, we must agree to the model's license terms
    // This is required before using the vision model
    try {
      // Send 'agree' to accept the license terms
      await ai.run(visionModel, {
        messages: [
          {
            role: 'user',
            content: 'agree'
          }
        ]
      })
    } catch (agreeError: any) {
      // If agreement fails, check if it's because we already agreed
      // Error code 5016 means we need to agree, but if it's a different error, continue
      // Continue - might already be agreed or will fail on actual request
    }
    
    // Now use the vision model with the image
    try {
      // Use messages format with image_url (OpenAI-compatible format for vision)
      response = await ai.run(visionModel, {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${normalizedMimeType};base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        max_tokens: 2400,
        temperature: EXTRACTION_TEMPERATURE,
        top_p: EXTRACTION_TOP_P,
        seed: EXTRACTION_SEED,
        response_format: {
          type: 'json_schema',
          json_schema: RECIPE_RESPONSE_SCHEMA
        }
      })
    } catch (error: any) {
      // Check if it's a license agreement error
      if (error.statusCode === 5016 || error.message?.includes('Model Agreement')) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Vision model requires license agreement. Please try again - the agreement should be accepted automatically on the first attempt.'
        })
      }
      throw error
    }

    const extractedData = parseAiRecipeJson(response)
    const firstPassNormalized = normalizeExtractedRecipe(extractedData)
    let normalized = firstPassNormalized

    const firstPassStats = getIngredientAnomalyStats(firstPassNormalized.ingredients)
    console.info('[extractRecipeFromImage] first-pass summary', {
      ingredientCount: firstPassNormalized.ingredients.length,
      stepCount: firstPassNormalized.steps.length,
      badIngredientCount: firstPassStats.bad,
      badIngredientRatio: firstPassStats.ratio
    })

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
        const baseScore = getExtractionQualityScore(firstPassNormalized)
        const correctedScore = getExtractionQualityScore(correctedNormalized)

        // Non-regression: only accept correction when it clearly improves output quality.
        if (correctedScore.total > baseScore.total) {
          normalized = correctedNormalized
        } else {
          normalized = firstPassNormalized
        }
      } catch {
        // Keep first-pass normalized data if correction pass fails.
        normalized = firstPassNormalized
      }
    }

    if (!hasMeaningfulExtraction(normalized)) {
      throw createError({
        statusCode: 422,
        statusMessage: 'No extractable recipe content found in this image.',
        data: {
          detail: 'AI could not confidently extract ingredients or steps. Try a brighter, closer crop with ingredients and method fully visible.'
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
      throw createError({
        statusCode: 429,
        statusMessage: 'AI rate limit exceeded. Please try again later.'
      })
    }
    if (error.statusCode === 402) {
      throw createError({
        statusCode: 402,
        statusMessage: 'AI quota exceeded. Please check your plan limits.'
      })
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
      data: {
        detail: originalErrorDetail
      }
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
  const appendNote = (a?: string, b?: string) => [a, b].filter(Boolean).join(', ').replace(/\s+/g, ' ').trim()
  const canonicalizeUnit = (value: string) => unitMap[value.trim().toLowerCase()] || value.trim().toLowerCase()
  const hasLetters = (value: string) => /[a-z]/i.test(value)
  const isBadIngredientName = (value: string) => {
    const name = value.trim()
    if (!name || !hasLetters(name)) return true
    if (/^\(?see\s+pages?\s+\d+/i.test(name)) return true
    if (/^\(?page\s+\d+/i.test(name)) return true
    if (/^[().,\-/\d\s]+$/.test(name)) return true
    return false
  }
  const moveReferenceTokensToNotes = (name: string, notes?: string) => {
    const referenceMatch = name.match(/\((?:see\s+)?pages?\s+\d+(?:[-–]\d+)?\)/i) || name.match(/\((?:see\s+)?page\s+\d+\)/i)
    if (!referenceMatch) return { name, notes }
    const cleanedName = name.replace(referenceMatch[0], '').replace(/\s+/g, ' ').trim().replace(/,$/, '')
    return { name: cleanedName, notes: appendNote(notes, referenceMatch[0]) }
  }
  const movePrepTokensToNotes = (name: string, notes?: string) => {
    let cleaned = name
    const found: string[] = []
    for (const prep of prepWords) {
      const re = new RegExp(`\\b${prep}\\b`, 'gi')
      if (re.test(cleaned)) {
        found.push(prep)
        cleaned = cleaned.replace(re, ' ')
      }
    }
    cleaned = cleaned.replace(/\s+/g, ' ').trim().replace(/^[,.\-]+|[,.\-]+$/g, '')
    return { name: cleaned, notes: found.length ? appendNote(notes, found.join(' ')) : notes }
  }
  const normaliseAmountAndUnit = (rawAmount: string, rawUnit: string, rawName: string, rawNotes?: string) => {
    let amount = rawAmount.trim()
    let unit = canonicalizeUnit(rawUnit || '')
    let ingredientName = rawName.trim()
    let notes = rawNotes?.trim()

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

    if (/cloves?/i.test(rawUnit) && (isBadIngredientName(ingredientName) || prepWords.includes(ingredientName.toLowerCase()))) {
      const maybeName = rawUnit.replace(/cloves?/ig, '').trim()
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
    let amount = String(ing.amount || ing.quantity || '').trim()
    let unit = String(ing.unit || '').trim()
    let ingredientName = String(ing.ingredientName || ing.name || ing.ingredient || '').trim()
    let notes = typeof ing.notes === 'string' ? ing.notes.trim() : undefined

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
    title: typeof data.title === 'string' ? data.title.trim() : undefined,
    description: typeof data.description === 'string' ? data.description.trim() : undefined,
    servings,
    ingredients: [],
    steps: [],
    tags: Array.isArray(data.tags) ? data.tags.filter((t: any) => typeof t === 'string') : [],
    source: typeof data.source === 'string' ? data.source.trim() : undefined,
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
