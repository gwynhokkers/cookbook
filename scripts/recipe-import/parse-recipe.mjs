/**
 * Deterministic transcript → recipe parsers, ported from
 * server/utils/recipeExtractor.ts (parseIngredientLine / parseMethodTextToSteps).
 */

const UNIT_ALIASES = {
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

export function canonicalUnitFromToken(token) {
  const key = String(token || '').trim().toLowerCase()
  return UNIT_ALIASES[key] || key
}

function splitNameAndCommaNotes(rest) {
  const pageRef = /\((?:page\s*)?\d+\)|\((?:see\s+)?pages?\s+\d+(?:[-–]\d+)?\)/gi
  const refs = []
  let working = rest.replace(pageRef, (m) => {
    refs.push(m.trim())
    return ' '
  })
  working = working.replace(/\s+/g, ' ').trim()

  const commaIdx = working.indexOf(',')
  if (commaIdx < 0) {
    return { ingredientName: working, notes: refs.join(', ') }
  }
  const ingredientName = working.slice(0, commaIdx).trim()
  const afterComma = working.slice(commaIdx + 1).trim()
  const notes = [afterComma, ...refs].filter(Boolean).join(', ').trim()
  return { ingredientName, notes }
}

export function parseIngredientLine(line) {
  let cleaned = String(line || '').replace(/^[-*•]\s+/, '').replace(/\s+/g, ' ').trim()
  if (!cleaned) {
    return { amount: '', unit: 'pieces', ingredientName: '', notes: '' }
  }

  if (/^for\s+the\s+/i.test(cleaned) || /^method\b/i.test(cleaned)) {
    return { amount: '', unit: 'pieces', ingredientName: cleaned, notes: '' }
  }

  const numUnitRest = cleaned.match(
    /^([\d¼½¾/.\s-]+)\s*(g|kg|ml|l|oz|lb|cm|cups?|tbsp|tsp|tablespoons?|teaspoons?|grams?|cloves?)\s+(.+)$/i
  )
  if (numUnitRest) {
    const amount = numUnitRest[1].trim()
    const unit = canonicalUnitFromToken(numUnitRest[2])
    const { ingredientName, notes } = splitNameAndCommaNotes(numUnitRest[3].trim())
    return { amount, unit, ingredientName, notes }
  }

  const leadingUnit = cleaned.match(/^(g|kg|ml|l|oz|lb|cm)\s+(.+)$/i)
  if (leadingUnit) {
    const unit = canonicalUnitFromToken(leadingUnit[1])
    const { ingredientName, notes } = splitNameAndCommaNotes(leadingUnit[2].trim())
    return { amount: '', unit, ingredientName, notes }
  }

  const spoonWord = cleaned.match(
    /^([\d¼½¾/.\s-]+)?\s*(tablespoons?|teaspoons?|tbsp|tsp)\s+(.+)$/i
  )
  if (spoonWord) {
    const amount = (spoonWord[1] || '').trim()
    const unit = canonicalUnitFromToken(spoonWord[2])
    const { ingredientName, notes } = splitNameAndCommaNotes(spoonWord[3].trim())
    return { amount, unit, ingredientName, notes }
  }

  const measurementMatch = cleaned.match(
    /^([\d¼½¾/.\s-]+)\s*(cups?|cup|tbsp|tsp|tablespoons?|teaspoons?|grams?|g|kg|oz|lb|ml|l|litres?|liters?|pieces?|cloves?)?\s*(.*)$/i
  )
  if (!measurementMatch) {
    return { amount: '', unit: 'pieces', ingredientName: cleaned, notes: '' }
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

export function parseMethodTextToSteps(methodText) {
  const raw = String(methodText || '').trim()
  if (!raw) return []

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

const SERVES_RE = /^(makes|serves)\b/i

/** Mirrors shared/utils/parseServings.ts */
function parseServings(value) {
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) {
      return undefined
    }
    return Math.floor(value)
  }
  const match = String(value).match(/\d+/)
  if (!match) {
    return undefined
  }
  const parsed = parseInt(match[0], 10)
  if (Number.isNaN(parsed) || parsed <= 0) {
    return undefined
  }
  return Math.floor(parsed)
}

const INGREDIENT_HINT = /^(\d|¼|½|¾|a\s+(good\s+)?pinch|a\s+little|oil\b|vegetable oil|for the\b)/i
const METHOD_HINT = /^(in a |heat |put |serve |place |add |mix |stir |fry |to make |first[, ]|now )/i
const QTY_SPLIT = /(?<=\S)\s+(?=[\d¼½¾][\d¼½¾/.\s-]*\s*(?:g|kg|ml|l|oz|lb|cm|cups?|tbsp|tsp|tablespoons?|teaspoons?)\b)/gi

function explodeJammedLines(lines) {
  const out = []
  for (const line of lines) {
    const parts = line.split(QTY_SPLIT).map((p) => p.trim()).filter(Boolean)
    out.push(...(parts.length ? parts : [line]))
  }
  return out
}

function looksLikeIngredientLine(line) {
  const t = line.replace(/^[-*•]\s+/, '').trim()
  if (!t) return false
  if (SERVES_RE.test(t)) return false
  if (METHOD_HINT.test(t) && t.length > 60) return false
  if (INGREDIENT_HINT.test(t) || /^\d/.test(t)) return true
  if (t.length < 80 && !/[.!?]$/.test(t)) return true
  return false
}

function looksLikeMethodLine(line) {
  const t = line.trim()
  if (t.length >= 90) return true
  if (METHOD_HINT.test(t)) return true
  return false
}

/**
 * Split a Docling markdown recipe section into title / description / ingredients / method.
 */
export function structureMarkdownSection(title, body) {
  const lines = explodeJammedLines(
    String(body || '')
      .split(/\r?\n/)
      .map((l) => l.replace(/^<!--.*?-->/, '').trim())
      .filter((l) => l && l !== '<!-- image -->')
  )

  let servings
  const descriptionParts = []
  const ingredientLines = []
  const methodParts = []
  let phase = 'intro'

  for (const line of lines) {
    const plain = line.replace(/^#+\s+/, '').trim()
    if (SERVES_RE.test(plain)) {
      servings = parseServings(plain)
      if (phase === 'intro') phase = 'ingredients'
      continue
    }

    if (phase === 'intro') {
      if (looksLikeIngredientLine(plain)) {
        phase = 'ingredients'
        ingredientLines.push(plain)
        continue
      }
      descriptionParts.push(plain)
      continue
    }

    if (phase === 'ingredients') {
      if (looksLikeMethodLine(plain) && !looksLikeIngredientLine(plain)) {
        phase = 'method'
        methodParts.push(plain)
        continue
      }
      ingredientLines.push(plain)
      continue
    }

    methodParts.push(plain)
  }

  const ingredients = ingredientLines
    .map(parseIngredientLine)
    .filter((ing) => ing.ingredientName && !/^for the\s+/i.test(ing.ingredientName))

  const steps = parseMethodTextToSteps(methodParts.join('\n\n'))

  return {
    title: String(title || '').replace(/\*\*/g, '').trim(),
    description: descriptionParts.join('\n\n').trim(),
    servings,
    ingredients,
    steps
  }
}

export function slugify(title) {
  return String(title || 'recipe')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60) || 'recipe'
}

export function normalizeTitleKey(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function titleOverlap(a, b) {
  const wa = new Set(normalizeTitleKey(a).split(' ').filter((w) => w.length > 2))
  const wb = new Set(normalizeTitleKey(b).split(' ').filter((w) => w.length > 2))
  if (wa.size === 0 || wb.size === 0) return 0
  let inter = 0
  for (const w of wa) if (wb.has(w)) inter++
  return inter / Math.min(wa.size, wb.size)
}
