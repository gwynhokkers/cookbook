import { describe, expect, it } from 'vitest'
import { normalizeServingsForStorage, parseServings } from '../../../shared/utils/parseServings'

describe('parseServings', () => {
  it('parses plain numbers and floored values', () => {
    expect(parseServings(4)).toBe(4)
    expect(parseServings(4.9)).toBe(4)
  })

  it('extracts the first positive integer from text', () => {
    expect(parseServings('Serves 4')).toBe(4)
    expect(parseServings('Makes 6-8')).toBe(6)
  })

  it('returns undefined for empty or non-positive values', () => {
    expect(parseServings(undefined)).toBeUndefined()
    expect(parseServings('')).toBeUndefined()
    expect(parseServings(0)).toBeUndefined()
    expect(parseServings('none')).toBeUndefined()
  })
})

describe('normalizeServingsForStorage', () => {
  it('returns null when the field should be cleared', () => {
    expect(normalizeServingsForStorage(null)).toBeNull()
    expect(normalizeServingsForStorage('')).toBeNull()
  })

  it('returns a positive integer when parseable', () => {
    expect(normalizeServingsForStorage('Serves 3')).toBe(3)
  })
})
