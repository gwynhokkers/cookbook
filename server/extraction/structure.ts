import type { AIClient } from '../utils/workersAi'
import type { ExtractedRecipe, TranscribedRecipeText } from './types'
import {
  EXTRACTION_SEED,
  EXTRACTION_TEMPERATURE,
  EXTRACTION_TOP_P,
  RECIPE_RESPONSE_SCHEMA
} from './types'
import {
  extractFirstJsonObject,
  normalizeExtractedRecipe,
  parseIngredientLine,
  parseMethodTextToSteps,
  sanitizeTriRegionMethodText,
  splitLines,
  safeTrim
} from './normalize'
import { transcriptToPromptText } from './transcript'

/** Workers AI / gateway may return structured JSON in `result.response` (object) when using json_schema; normalise to a string for parsing. */
export const coerceAiResponseToText = (value: unknown): string => {
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

export function parseJsonSegmentLenient(segment: string): unknown {
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

export const pickStringField = (o: Record<string, unknown>, ...keys: string[]): string => {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string') return v
  }
  return ''
}

/** Workers AI sometimes returns one line per array element instead of a single newline-separated string. */
export const coerceMultilineSchemaField = (v: unknown): string => {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).join('\n')
  return ''
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

export const parseAiRecipeJson = (response: any): ExtractedRecipe => {
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

export const getIngredientAnomalyStats = (ingredients: ExtractedRecipe['ingredients']) => {
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

export const shouldRunCorrectionPass = (recipe: ExtractedRecipe) => {
  const stats = getIngredientAnomalyStats(recipe.ingredients)
  if (stats.total < 2) return false
  return stats.ratio >= 0.25
}

export const isMeaningfulStep = (step: { title: string; content: string }) => {
  const content = String(step.content || '').trim()
  return content.length >= 12
}

export const getExtractionQualityScore = (recipe: ExtractedRecipe) => {
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

export const hasMeaningfulExtraction = (recipe: ExtractedRecipe) => {
  const quality = getExtractionQualityScore(recipe)
  const desc = safeTrim(recipe.description)
  const hasIntroOnlyContent = Boolean(safeTrim(recipe.title)) && desc.length >= 80
  return quality.validIngredients > 0 || quality.meaningfulSteps > 0 || hasIntroOnlyContent
}

export const structureFromTranscript = (transcript: TranscribedRecipeText): ExtractedRecipe => {
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

const STRUCTURE_PROMPT_PREFIX = `Given this cookbook transcript, return one JSON object matching the schema.
Split ingredients into amount, unit, ingredientName, and notes fields.
Split the method into steps with plain instruction text in each step's content field.
Do not invent text that is not present in the transcript.
Transcript:
`

export const runStructureModel = async (
  ai: AIClient,
  transcript: TranscribedRecipeText,
  structureModel: string
): Promise<ExtractedRecipe> => {
  const transcriptText = transcriptToPromptText(transcript)
  const response = await ai.runTextModel(structureModel, {
    messages: [{ role: 'user', content: STRUCTURE_PROMPT_PREFIX + transcriptText }],
    max_tokens: 2200,
    temperature: EXTRACTION_TEMPERATURE,
    top_p: EXTRACTION_TOP_P,
    seed: EXTRACTION_SEED,
    response_format: {
      type: 'json_schema',
      json_schema: RECIPE_RESPONSE_SCHEMA
    }
  })
  return parseAiRecipeJson(response)
}
