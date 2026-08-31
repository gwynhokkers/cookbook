import { parseServings } from '~~/shared/utils/parseServings'
import type { TranscribedRecipeText, TranscriptRegion } from './types'
import { safeTrim } from './normalize'

export const parseTranscriptFromPlainText = (text: string, region: TranscriptRegion): TranscribedRecipeText => {
  const raw = text.trim()
  if (!raw) {
    return {}
  }

  if (region === 'ingredients') {
    return { ingredientsText: raw }
  }
  if (region === 'method') {
    return { methodText: raw }
  }
  if (region === 'title') {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) {
      return {}
    }
    const title = lines[0].replace(/^(title|recipe)\s*:\s*/i, '').trim()
    let servings: number | undefined
    const descriptionLines: string[] = []
    for (const line of lines.slice(1)) {
      if (servings == null && /^(makes|serves)\b/i.test(line)) {
        servings = parseServings(line)
      } else {
        descriptionLines.push(line)
      }
    }
    return {
      title,
      description: descriptionLines.join('\n').trim() || undefined,
      servings
    }
  }

  const upper = raw.toUpperCase()
  const titleIdx = upper.indexOf('TITLE:')
  const ingIdx = upper.indexOf('INGREDIENTS:')
  const methodIdx = upper.indexOf('METHOD:')
  const descIdx = upper.indexOf('DESCRIPTION:')
  const servingsIdx = upper.indexOf('SERVINGS:')

  if (titleIdx >= 0 || ingIdx >= 0 || methodIdx >= 0 || servingsIdx >= 0) {
    const sliceSection = (start: number, end: number) =>
      raw.slice(start, end < 0 ? undefined : end).replace(/^[^:]+:\s*/i, '').trim()

    const titleEnd = [ingIdx, methodIdx, descIdx, servingsIdx].filter((i) => i >= 0 && i > titleIdx)[0] ?? -1
    const descEnd = [ingIdx, methodIdx, servingsIdx].filter((i) => i >= 0 && i > descIdx)[0] ?? -1
    const servingsEnd = [ingIdx, methodIdx, descIdx].filter((i) => i >= 0 && i > servingsIdx)[0] ?? -1
    const ingEnd = methodIdx >= 0 && methodIdx > ingIdx ? methodIdx : -1

    const transcript: TranscribedRecipeText = {}
    if (titleIdx >= 0) {
      transcript.title = sliceSection(titleIdx, titleEnd)
    }
    if (descIdx >= 0) {
      transcript.description = sliceSection(descIdx, descEnd)
    }
    if (servingsIdx >= 0) {
      transcript.servings = parseServings(sliceSection(servingsIdx, servingsEnd))
    }
    if (ingIdx >= 0) {
      transcript.ingredientsText = sliceSection(ingIdx, ingEnd)
    }
    if (methodIdx >= 0) {
      transcript.methodText = sliceSection(methodIdx, -1)
    }
    return transcript
  }

  return { ingredientsText: raw, methodText: raw }
}

export const mergeTranscripts = (...parts: TranscribedRecipeText[]): TranscribedRecipeText => {
  const merged: TranscribedRecipeText = { tags: [] }
  for (const p of parts) {
    if (p.title?.trim() && !merged.title?.trim()) {
      merged.title = p.title.trim()
    }
    if (p.description?.trim() && !merged.description?.trim()) {
      merged.description = p.description.trim()
    }
    if (p.ingredientsText?.trim()) {
      merged.ingredientsText = [merged.ingredientsText, p.ingredientsText.trim()]
        .filter(Boolean)
        .join('\n')
    }
    if (p.methodText?.trim()) {
      merged.methodText = [merged.methodText, p.methodText.trim()].filter(Boolean).join('\n')
    }
    if (typeof p.servings === 'number' && merged.servings == null) {
      merged.servings = p.servings
    }
    if (Array.isArray(p.tags) && p.tags.length > 0) {
      merged.tags = [...(merged.tags || []), ...p.tags]
    }
  }
  return merged
}

export const transcriptToPromptText = (transcript: TranscribedRecipeText): string => {
  const parts: string[] = []
  if (safeTrim(transcript.title)) {
    parts.push(`TITLE:\n${transcript.title}`)
  }
  if (safeTrim(transcript.description)) {
    parts.push(`DESCRIPTION:\n${transcript.description}`)
  }
  if (safeTrim(transcript.ingredientsText)) {
    parts.push(`INGREDIENTS:\n${transcript.ingredientsText}`)
  }
  if (safeTrim(transcript.methodText)) {
    parts.push(`METHOD:\n${transcript.methodText}`)
  }
  if (transcript.servings != null) {
    parts.push(`SERVINGS: ${transcript.servings}`)
  }
  if (Array.isArray(transcript.tags) && transcript.tags.length > 0) {
    parts.push(`TAGS: ${transcript.tags.join(', ')}`)
  }
  return parts.join('\n\n')
}
