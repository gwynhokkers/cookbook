import { describe, expect, it } from 'vitest'
import {
  isRecipeSourceUrl,
  normalizeSourceUrl,
  parseRecipeSource,
  splitSourceAndUrl
} from '../../../shared/utils/formatRecipeSource'

describe('isRecipeSourceUrl', () => {
  it('detects http(s) URLs', () => {
    expect(isRecipeSourceUrl('https://example.com/recipe')).toBe(true)
    expect(isRecipeSourceUrl('http://example.com')).toBe(true)
    expect(isRecipeSourceUrl('  https://example.com  ')).toBe(true)
  })

  it('rejects non-URLs', () => {
    expect(isRecipeSourceUrl('Ottolenghi Simple — Yotam Ottolenghi')).toBe(false)
    expect(isRecipeSourceUrl('')).toBe(false)
  })
})

describe('normalizeSourceUrl', () => {
  it('returns null for empty values', () => {
    expect(normalizeSourceUrl(null)).toBeNull()
    expect(normalizeSourceUrl('')).toBeNull()
    expect(normalizeSourceUrl('   ')).toBeNull()
  })

  it('accepts http(s) URLs', () => {
    expect(normalizeSourceUrl('https://example.com/r')).toBe('https://example.com/r')
  })

  it('rejects non-http URLs', () => {
    expect(() => normalizeSourceUrl('ftp://example.com')).toThrow(/http/i)
    expect(() => normalizeSourceUrl('not-a-url')).toThrow(/http/i)
  })
})

describe('splitSourceAndUrl', () => {
  it('returns nulls for empty input', () => {
    expect(splitSourceAndUrl(null)).toEqual({ source: null, sourceUrl: null })
    expect(splitSourceAndUrl('')).toEqual({ source: null, sourceUrl: null })
  })

  it('splits a bare URL into hostname label + url', () => {
    expect(splitSourceAndUrl('https://www.livewellbakeoften.com/cookies/')).toEqual({
      source: 'livewellbakeoften.com',
      sourceUrl: 'https://www.livewellbakeoften.com/cookies/'
    })
  })

  it('extracts a trailing parenthesized URL', () => {
    const packed =
      'The Clever Carrot — Emilie Raffa (https://www.theclevercarrot.com/2021/06/easy-homemade-sourdough-bagels/)'
    expect(splitSourceAndUrl(packed)).toEqual({
      source: 'The Clever Carrot — Emilie Raffa',
      sourceUrl: 'https://www.theclevercarrot.com/2021/06/easy-homemade-sourdough-bagels/'
    })
  })

  it('extracts a trailing bare URL', () => {
    expect(
      splitSourceAndUrl(
        'The Clever Carrot — Emilie Raffa https://www.theclevercarrot.com/bagels/'
      )
    ).toEqual({
      source: 'The Clever Carrot — Emilie Raffa',
      sourceUrl: 'https://www.theclevercarrot.com/bagels/'
    })
  })

  it('leaves plain labels unchanged', () => {
    expect(splitSourceAndUrl('Curry Easy — Atul Kochhar')).toEqual({
      source: 'Curry Easy — Atul Kochhar',
      sourceUrl: null
    })
  })
})

describe('parseRecipeSource', () => {
  it('returns null for empty source', () => {
    expect(parseRecipeSource(null)).toBeNull()
    expect(parseRecipeSource('')).toBeNull()
    expect(parseRecipeSource('   ')).toBeNull()
  })

  it('parses a bare URL as a hostname label (legacy)', () => {
    expect(parseRecipeSource('https://www.livewellbakeoften.com/cookies/')).toEqual({
      label: 'livewellbakeoften.com',
      isUrl: true
    })
  })

  it('parses Book — Author without a URL', () => {
    expect(parseRecipeSource('Curry Easy — Atul Kochhar')).toEqual({
      label: 'Curry Easy — Atul Kochhar',
      book: 'Curry Easy',
      author: 'Atul Kochhar',
      isUrl: false
    })
  })

  it('does not extract packed URLs from the label (use sourceUrl prop instead)', () => {
    const packed =
      'The Clever Carrot — Emilie Raffa (https://www.theclevercarrot.com/bagels/)'
    const parsed = parseRecipeSource(packed)
    expect(parsed?.book).toBe('The Clever Carrot')
    expect(parsed?.author).toContain('https://')
    expect(parsed).not.toHaveProperty('href')
  })
})
