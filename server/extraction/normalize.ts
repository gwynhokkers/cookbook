import { toRecipeTitleCase } from '~~/shared/utils/recipeTitle'
import { parseServings } from '~~/shared/utils/parseServings'
import type { ExtractedRecipe } from './types'

/**
 * First balanced `{ ... }` from the first `{`, respecting JSON string rules so `{`/`}` inside
 * ingredients/method text does not truncate the payload (naive brace counting breaks OCR JSON).
 */
export function extractFirstJsonObject(text: string): string | null {
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

export const normalizeErrorDetail = (value: unknown, fallback = 'Unknown error', maxLength = 2000): string => {
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
export const safeTrim = (value: unknown): string => String(value ?? '').trim()

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
export const sanitizeTriRegionMethodText = (raw: string): string => {
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

export const splitLines = (text: string) => text
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
export const parseIngredientLine = (line: string) => {
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

export const parseMethodTextToSteps = (methodText: string) => {
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

/**
 * Normalize and validate extracted recipe data
 */
export function normalizeExtractedRecipe(data: any): ExtractedRecipe {
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

  const servings = parseServings(data.servings)

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
