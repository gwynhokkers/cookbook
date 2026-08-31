/**
 * Heuristic checks for mangled OCR / parser output in reviewed recipe JSON.
 * Used by audit-recipes.mjs (CLI) and upload.mjs (pre-upload gate).
 */

const FLAVOR_TAG =
  /^(slightly|light|warmly|mild|rich|hot|spicy|tangy|souplike|fullflavoured|full-flavoured|colourful|thin|fresh|chilli hot)\b/i

const QUANTITY_ONLY_STEP =
  /^\d+(\.\d+)?\s*(tbsp|tsp|g|grams|ml|oz|kg|litre|litres|fl oz)\b/i

const METHOD_VERB = /\b(Put|Add|Heat|Mix|Stir|Cook|Serve|Blend|Season|Pour|Cover|Remove|Preheat|Knead|Sift|Whisk|Fry|Simmer|Bake|Roast|Marinate|Combine|Divide|Shape|Turn|Reduce|Bring|Lower|Adjust|Garnish|Transfer|Slice|Chop|Dice|Cut|Place|Leave|Set aside|Meanwhile|When|Once|Until|Allow|Spread|Roll|Score|Slide|Sprinkle|Knock back)\b/i

/** @typedef {{ code: string, message: string, detail?: string }} AuditIssue */

/**
 * @param {unknown} recipe
 * @param {string} [filename]
 * @returns {AuditIssue[]}
 */
export function auditRecipe(recipe, filename = '') {
  const issues = []
  const prefix = filename ? `${filename}: ` : ''

  if (!recipe || typeof recipe !== 'object') {
    issues.push({ code: 'invalid', message: `${prefix}not a JSON object` })
    return issues
  }

  const r = /** @type {Record<string, unknown>} */ (recipe)
  const title = String(r.title || '').trim()
  const source = String(r.source || '').trim()
  const steps = Array.isArray(r.steps) ? r.steps : null
  const ingredients = Array.isArray(r.ingredients) ? r.ingredients : null

  if (!title) issues.push({ code: 'missing-title', message: `${prefix}missing title` })
  if (!source) issues.push({ code: 'missing-source', message: `${prefix}missing source` })
  if (!steps?.length) issues.push({ code: 'no-steps', message: `${prefix}no steps` })
  if (!ingredients?.length) issues.push({ code: 'no-ingredients', message: `${prefix}no ingredients` })

  if (steps) {
    const seen = new Set()
    for (const [i, step] of steps.entries()) {
      const content = String(step?.content || '').trim()
      const stepLabel = `${prefix}step ${i + 1}`

      if (!content) {
        issues.push({ code: 'empty-step', message: `${stepLabel} is empty` })
        continue
      }
      if (/^-{4,}/.test(content) || content.includes('----')) {
        issues.push({
          code: 'dashed-step',
          message: `${stepLabel} looks like a table separator`,
          detail: content.slice(0, 60)
        })
      }
      if (FLAVOR_TAG.test(content) && content.length < 80) {
        issues.push({
          code: 'flavor-tag-step',
          message: `${stepLabel} looks like a flavor tag, not a method step`,
          detail: content
        })
      }
      if (QUANTITY_ONLY_STEP.test(content) && content.length < 80 && !METHOD_VERB.test(content)) {
        issues.push({
          code: 'quantity-step',
          message: `${stepLabel} looks like a stray ingredient line`,
          detail: content
        })
      }
      if (seen.has(content)) {
        issues.push({ code: 'duplicate-step', message: `${stepLabel} duplicates another step` })
      }
      seen.add(content)
    }
  }

  if (ingredients) {
    for (const [i, ing] of ingredients.entries()) {
      const name = String(ing?.ingredientName || '').trim()
      const ingLabel = `${prefix}ingredient ${i + 1}`

      if (!name) {
        issues.push({ code: 'empty-ingredient', message: `${ingLabel} has no name` })
        continue
      }
      if (name.length > 90) {
        issues.push({
          code: 'long-ingredient-name',
          message: `${ingLabel} name is too long (likely OCR jam)`,
          detail: name.slice(0, 80) + '…'
        })
      }
      if (/\bStep\s+\d/i.test(name) || /Curry stand/i.test(name)) {
        issues.push({
          code: 'method-in-ingredient',
          message: `${ingLabel} name contains method text`,
          detail: name.slice(0, 80)
        })
      }
      if (
        /\b\d+\s*(tbsp|tsp|g|ml|oz|kg|sprigs?|cloves?|pieces?)\b/i.test(name) &&
        name.length > 40
      ) {
        issues.push({
          code: 'jammed-ingredient',
          message: `${ingLabel} name embeds quantities (likely column merge)`,
          detail: name.slice(0, 80)
        })
      }
      if (/^\(\d+\s*oz\)\s*each$/i.test(name) || /^loz\b/i.test(name)) {
        issues.push({
          code: 'ocr-garbage-ingredient',
          message: `${ingLabel} name looks like OCR garbage`,
          detail: name
        })
      }
    }
  }

  return issues
}

/**
 * @param {AuditIssue[]} issues
 * @returns {boolean}
 */
export function auditPassed(issues) {
  return issues.length === 0
}
