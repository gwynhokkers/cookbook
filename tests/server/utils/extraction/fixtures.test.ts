import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeExtractedRecipe } from '../../../../server/extraction/normalize'
import { hasMeaningfulExtraction } from '../../../../server/extraction/structure'

const fixturesDir = path.resolve(process.cwd(), 'scripts/extraction-fixtures')

describe('extraction fixtures through normalize', () => {
  it('normalizes checked-in good fixtures without emptying them', async () => {
    const files = (await readdir(fixturesDir))
      .filter(file => file.endsWith('.json') && file.includes('good'))

    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const fixture = JSON.parse(await readFile(path.join(fixturesDir, file), 'utf8'))
      const normalized = normalizeExtractedRecipe(fixture.output)

      expect(hasMeaningfulExtraction(normalized), file).toBe(true)
      expect(normalized.ingredients.length, file).toBeGreaterThan(0)
      expect(normalized.steps.length, file).toBeGreaterThan(0)
    }
  })
})
