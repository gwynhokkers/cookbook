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

/**
 * Extract recipe information from an image using AI vision model
 */
/**
 * Get AI client - works in both local dev (via API) and production (via binding)
 * In NuxtHub v0.10, process.env.AI is available in production
 * For local dev, we create a proxy that calls Cloudflare API directly
 */
async function getAIClient(): Promise<any> {
  // Method 1: Try process.env.AI (production/Cloudflare Workers binding)
  // This is automatically available when deployed to Cloudflare Workers
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
          
          throw createError({
            statusCode: response.status,
            statusMessage: `Cloudflare AI API error: ${errorData.message || errorData.error?.[0]?.message || errorData.errors?.[0]?.message || errorText}`
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

export async function extractRecipeFromImage(imageBase64: string, event?: any): Promise<ExtractedRecipe> {
  // Get AI client (works in both local dev and production)
  const ai = await getAIClient()

  // Create a detailed prompt for recipe extraction
  // IMPORTANT: The prompt must explicitly instruct the model to analyze the IMAGE
  const prompt = `You are a recipe extraction assistant. I am providing you with an IMAGE of a recipe. You must carefully analyze the IMAGE and extract the recipe information that is VISIBLE IN THE IMAGE. Do NOT generate a generic recipe - extract ONLY what you can see in the image.

Return the extracted information in this EXACT JSON format (no markdown, no code blocks, just pure JSON):

{
  "title": "Recipe title as it appears in the image",
  "description": "Description if visible in image, otherwise empty string",
  "servings": number of servings as a number (e.g., 2, 4, 6). If you see a range like "2-3 servings" or "4-6 servings", use the lower number. If servings are not specified, omit this field,
  "ingredients": [
    {
      "amount": "exact amount as shown in image (e.g., '2', '1.5', '1/2')",
      "unit": "unit as shown in image (e.g., 'cups', 'tbsp', 'tsp', 'grams', 'ml', 'pieces')",
      "ingredientName": "ingredient name as written in the image",
      "notes": "any preparation notes visible in image (e.g., 'chopped', 'diced', 'fresh')"
    }
  ],
  "steps": [
    {
      "title": "Step number or title as shown in image",
      "content": "Step instructions exactly as written in the image"
    }
  ],
  "tags": ["tags if visible in image"],
  "source": "Source URL or name if visible in image"
}

CRITICAL INSTRUCTIONS:
- Look at the IMAGE carefully and extract ONLY what is visible
- Do NOT make up or generate example recipes
- For servings: if you see "2-3 servings" or "4-6 servings", use the lower number (2 or 4)
- If you cannot see certain information in the image, use empty strings or empty arrays
- Extract ingredients EXACTLY as they appear in the image
- Extract steps EXACTLY as they appear in the image
- Return ONLY valid JSON - no explanations, no markdown code blocks`

  try {
    // Use a vision-capable model
    // Note: Cloudflare Workers AI API format may vary
    // Check Workers AI documentation for the correct format for vision models
    // For now, we'll use a format that should work with most models
    
    // Convert base64 to buffer for potential image input
    const imageBuffer = Buffer.from(imageBase64, 'base64')
    
    // Try different API formats based on what Workers AI supports
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
                  url: `data:image/jpeg;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        max_tokens: 2000
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

    // Parse the response
    let extractedData: ExtractedRecipe

    // The response might be text that needs parsing
    // Handle nested structure: response.result.response (from AI Gateway)
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

    // Try to extract JSON from the response
    // Remove markdown code blocks if present
    let jsonText = responseText.trim()
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }

    // Try to extract JSON object from text that might have explanatory text before it
    // Look for the first { that starts a JSON object
    let jsonStartIndex = jsonText.indexOf('{')
    if (jsonStartIndex > 0) {
      jsonText = jsonText.substring(jsonStartIndex)
    }

    // Try to find the matching closing brace to extract complete JSON
    // This handles cases where there's text after the JSON too
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
      extractedData = JSON.parse(jsonText)
    } catch (parseError: any) {
      // Try a more aggressive JSON extraction - look for JSON object with balanced braces
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          extractedData = JSON.parse(jsonMatch[0])
        } catch (regexParseError: any) {
          // If JSON parsing fails, try to extract structured data from text
          // This is a fallback for when the model returns formatted text instead of JSON
          extractedData = parseTextResponse(responseText)
        }
      } else {
        extractedData = parseTextResponse(responseText)
      }
    }

    // Validate and normalize the extracted data
    return normalizeExtractedRecipe(extractedData)
  } catch (error: any) {
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
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to extract recipe: ${error.message || 'Unknown error'}`
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
      .map((ing: any) => {
        let amount = String(ing.amount || ing.quantity || '').trim()
        let unit = String(ing.unit || '').trim()
        let ingredientName = String(ing.ingredientName || ing.name || ing.ingredient || '').trim()
        let notes = typeof ing.notes === 'string' ? ing.notes.trim() : undefined

        // Unit normalization map (abbreviation -> full name)
        const unitMap: Record<string, string> = {
          'g': 'grams',
          'kg': 'kg',
          'oz': 'oz',
          'lb': 'lb',
          'ml': 'ml',
          'l': 'l',
          'tbsp': 'tbsp',
          'tsp': 'tsp',
          'cups': 'cups',
          'cup': 'cups',
          'pieces': 'pieces',
          'piece': 'pieces',
          'cloves': 'pieces', // "3 garlic cloves" -> 3 pieces
          'clove': 'pieces'
        }

        // Common units for validation
        const commonUnits = ['cups', 'tbsp', 'tsp', 'grams', 'kg', 'oz', 'lb', 'ml', 'l', 'pieces', 'piece', 'tablespoon', 'teaspoon', 'cup', 'pound', 'ounce', 'gram', 'kilogram', 'milliliter', 'liter', 'litre', 'cloves', 'clove']

        // Preparation keywords to extract from ingredient names
        const preparationKeywords = ['chopped', 'diced', 'sliced', 'finely sliced', 'minced', 'ground', 'fresh', 'dried', 'optional', 'at room temperature', 'warm', 'cold', 'softened', 'melted', 'crushed', 'grated', 'shredded', 'julienned', 'cubed', 'slivered']

        // Parse combined amount/unit strings like "250 g/9 oz" or "1 tsp" or "3 garlic cloves"
        // Try to extract numeric amount and unit from the amount field
        const originalAmount = amount
        if (amount && !unit) {
          // Pattern 1: "3 garlic cloves" - number followed by ingredient name with "cloves"
          const clovesMatch = amount.match(/^([\d./\s-]+)\s+(.+?)\s+cloves?/i)
          if (clovesMatch) {
            amount = clovesMatch[1].trim()
            unit = 'pieces'
            if (!ingredientName) {
              ingredientName = clovesMatch[2].trim()
            }
          } else {
            // Pattern 2: Extract number followed by unit (e.g., "250 g", "1 tsp", "3 cloves")
            const standardUnitMatch = amount.match(/^([\d./\s-]+)\s+([a-zA-Z]+(?:\s*\/\s*[\d./\s]+\s*[a-zA-Z]+)?)/)
            if (standardUnitMatch) {
              const extractedAmount = standardUnitMatch[1].trim()
              const extractedUnit = standardUnitMatch[2].trim()
              const extractedUnitLower = extractedUnit.toLowerCase()
              
              // Check if it's a real unit (including "cloves" which means "pieces")
              const isRealUnit = commonUnits.some(u => extractedUnitLower === u || extractedUnitLower.startsWith(u + ' ') || extractedUnitLower.endsWith(' ' + u))
              
              if (isRealUnit || extractedUnitLower === 'cloves' || extractedUnitLower === 'clove') {
                amount = extractedAmount
                // Normalize "cloves"/"clove" to "pieces"
                if (extractedUnitLower === 'cloves' || extractedUnitLower === 'clove') {
                  unit = 'pieces'
                } else {
                  unit = extractedUnitLower
                }
                
                // Get remaining text after amount+unit (could be ingredient name or description)
                const remaining = originalAmount.substring(standardUnitMatch[0].length).trim()
                if (remaining && !ingredientName) {
                  // If remaining text looks like it starts with an ingredient name, use it
                  ingredientName = remaining
                }
              } else {
                // Pattern 3: Just a number, assume pieces
                const numberMatch = amount.match(/^([\d./\s-]+)(?:\s+(.+))?$/)
                if (numberMatch && !isNaN(parseFloat(numberMatch[1]))) {
                  amount = numberMatch[1].trim()
                  unit = 'pieces'
                  if (numberMatch[2] && !ingredientName) {
                    ingredientName = numberMatch[2].trim()
                  }
                }
              }
            } else {
              // Pattern 4: Just a number, assume pieces
              const numberMatch = amount.match(/^([\d./\s-]+)(?:\s+(.+))?$/)
              if (numberMatch && !isNaN(parseFloat(numberMatch[1]))) {
                amount = numberMatch[1].trim()
                unit = 'pieces'
                if (numberMatch[2] && !ingredientName) {
                  ingredientName = numberMatch[2].trim()
                }
              }
            }
          }
        }

        // Normalize unit abbreviations to full names
        const unitLower = unit.toLowerCase()
        if (unitMap[unitLower]) {
          unit = unitMap[unitLower]
        }

        // Extract preparation descriptions from ingredient name
        if (ingredientName) {
          const nameLower = ingredientName.toLowerCase()
          const foundPreparations: string[] = []
          
          for (const prep of preparationKeywords) {
            if (nameLower.includes(prep)) {
              foundPreparations.push(prep)
              // Remove preparation from ingredient name
              const regex = new RegExp(`\\b${prep}\\b`, 'gi')
              ingredientName = ingredientName.replace(regex, '').trim()
              // Clean up extra commas and spaces
              ingredientName = ingredientName.replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '').trim()
            }
          }
          
          if (foundPreparations.length > 0) {
            const prepText = foundPreparations.join(', ')
            if (!notes) {
              notes = prepText
            } else {
              notes = `${prepText}, ${notes}`
            }
          }
        }

        // If unit field contains ingredient description (not a real unit), move it to notes
        const unitLowerCheck = unit.toLowerCase()
        const isRealUnitCheck = commonUnits.some(u => unitLowerCheck === u || unitLowerCheck.startsWith(u + ' ') || unitLowerCheck.endsWith(' ' + u))
        
        if (unit && !isRealUnitCheck && unit.length > 3) {
          // Unit field likely contains ingredient description, move to notes
          if (!notes) {
            notes = unit
          } else {
            notes = `${unit}, ${notes}`
          }
          unit = ''
        }

        // If ingredientName is empty but unit contains ingredient info, use unit as name
        if (!ingredientName && unit && !isRealUnitCheck) {
          ingredientName = unit
          unit = ''
        }

        // Ensure we have a unit default
        if (!unit) {
          unit = 'pieces'
        }

        return {
          amount,
          unit,
          ingredientName,
          notes
        }
      })
      .filter((ing: any) => ing.ingredientName) // Only keep ingredients with names
  }

  // Normalize steps
  if (Array.isArray(data.steps)) {
    normalized.steps = data.steps
      .filter((step: any) => step && typeof step === 'object')
      .map((step: any, index: number) => ({
        title: String(step.title || `Step ${index + 1}`).trim(),
        content: String(step.content || step.text || step.instruction || '').trim()
      }))
      .filter((step: any) => step.content) // Only keep steps with content
  } else if (Array.isArray(data.instructions)) {
    // Handle alternative field name
    normalized.steps = data.instructions
      .filter((step: any) => step && typeof step === 'object')
      .map((step: any, index: number) => ({
        title: String(step.title || `Step ${index + 1}`).trim(),
        content: String(step.content || step.text || step.instruction || step).trim()
      }))
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
