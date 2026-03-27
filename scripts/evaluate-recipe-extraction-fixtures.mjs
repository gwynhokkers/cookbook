import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const fixturesDir = path.resolve(process.cwd(), 'scripts/extraction-fixtures')

const canonicalUnits = new Set(['cups', 'tbsp', 'tsp', 'grams', 'kg', 'oz', 'lb', 'ml', 'l', 'pieces'])

const hasLetters = (value) => /[a-z]/i.test(value || '')
const isReferenceLike = (value) => /\(?see\s+pages?\s+\d+/i.test(value || '') || /\(?see\s+page\s+\d+/i.test(value || '')
const isBadIngredientName = (value) => {
  const name = String(value || '').trim()
  if (!name || !hasLetters(name)) return true
  if (isReferenceLike(name)) return true
  if (/^[().,\-/\d\s]+$/.test(name)) return true
  return false
}

const normalizeUnit = (value) => String(value || '').trim().toLowerCase()

const evaluateFixture = (fixture) => {
  const ingredients = Array.isArray(fixture?.output?.ingredients) ? fixture.output.ingredients : []
  const parseSuccess = Boolean(fixture?.output && typeof fixture.output === 'object')

  let validNames = 0
  let canonicalUnitsCount = 0
  let referenceInNameCount = 0

  for (const ingredient of ingredients) {
    const name = String(ingredient?.ingredientName || '')
    const unit = normalizeUnit(ingredient?.unit)
    if (!isBadIngredientName(name)) validNames++
    if (canonicalUnits.has(unit)) canonicalUnitsCount++
    if (isReferenceLike(name)) referenceInNameCount++
  }

  const total = ingredients.length || 1
  return {
    fixture: fixture.name || 'unnamed-fixture',
    parseSuccess,
    ingredientCount: ingredients.length,
    validIngredientNameRate: Number((validNames / total).toFixed(3)),
    canonicalUnitRate: Number((canonicalUnitsCount / total).toFixed(3)),
    referenceInNameRate: Number((referenceInNameCount / total).toFixed(3))
  }
}

const main = async () => {
  const files = await readdir(fixturesDir)
  const jsonFiles = files.filter(file => file.endsWith('.json'))

  if (jsonFiles.length === 0) {
    console.log('No fixtures found in scripts/extraction-fixtures')
    process.exit(0)
  }

  const results = []
  for (const file of jsonFiles) {
    const fullPath = path.join(fixturesDir, file)
    const data = await readFile(fullPath, 'utf8')
    const fixture = JSON.parse(data)
    results.push(evaluateFixture(fixture))
  }

  const totals = results.reduce((acc, row) => {
    acc.parseSuccess += row.parseSuccess ? 1 : 0
    acc.validIngredientNameRate += row.validIngredientNameRate
    acc.canonicalUnitRate += row.canonicalUnitRate
    acc.referenceInNameRate += row.referenceInNameRate
    return acc
  }, { parseSuccess: 0, validIngredientNameRate: 0, canonicalUnitRate: 0, referenceInNameRate: 0 })

  const count = results.length
  const summary = {
    fixtures: count,
    parseSuccessRate: Number((totals.parseSuccess / count).toFixed(3)),
    avgValidIngredientNameRate: Number((totals.validIngredientNameRate / count).toFixed(3)),
    avgCanonicalUnitRate: Number((totals.canonicalUnitRate / count).toFixed(3)),
    avgReferenceInNameRate: Number((totals.referenceInNameRate / count).toFixed(3))
  }

  console.log('Per fixture:')
  for (const row of results) {
    console.log(JSON.stringify(row))
  }
  console.log('\nSummary:')
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error('Failed to evaluate extraction fixtures:', error)
  process.exit(1)
})
