import type { AIClient } from '../utils/workersAi'
import {
  EXTRACTION_SEED,
  EXTRACTION_TEMPERATURE,
  EXTRACTION_TOP_P
} from './types'
import {
  coerceAiResponseToText,
  coerceMultilineSchemaField,
  pickStringField
} from './structure'
import { extractFirstJsonObject, sanitizeTriRegionMethodText } from './normalize'

export const normalizeImageMimeType = (imageMimeType?: string): string => {
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

export const runVisionPrompt = async (ai: AIClient, visionModel: string, prompt: string, imageDataUrl: string, responseFormat: unknown, maxTokens = 2200) => {
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

export const coerceVisionResponseToText = (response: unknown): string => {
  if (typeof response === 'string') {
    return response.trim()
  }
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    const r = response as Record<string, unknown>
    if (r.response != null) {
      return coerceAiResponseToText(r.response).trim()
    }
    const result = r.result as Record<string, unknown> | undefined
    if (result?.response != null) {
      return coerceAiResponseToText(result.response).trim()
    }
    const choices = r.choices as Array<{ message?: { content?: string } }> | undefined
    const content = choices?.[0]?.message?.content
    if (typeof content === 'string') {
      return content.trim()
    }
  }
  return coerceAiResponseToText(response).trim()
}

export const runVisionTranscription = async (
  ai: AIClient,
  ocrModel: string,
  prompt: string,
  imageDataUrl: string,
  maxTokens = 2400
): Promise<string> => {
  const response = await ai.run(ocrModel, {
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
    seed: EXTRACTION_SEED
  })
  return coerceVisionResponseToText(response)
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
export const sanitizeRegionTitle = (title: string, titleResponse: unknown): string => {
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

/** Region extraction expects `ingredientsText`; `parseTextResponse` fallback uses structured `ingredients`. */
export const ingredientsTextFromRegionParsed = (data: Record<string, unknown>): string => {
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

export const methodTextFromRegionParsed = (data: Record<string, unknown>): string => {
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
export function resolveRegionTitleFromParsed(titleData: Record<string, unknown>, titleResponse: unknown): string {
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

export function resolveRegionMethodText(methodData: Record<string, unknown>, methodResponse: unknown): string {
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
