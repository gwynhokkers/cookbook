import { describe, expect, it } from 'vitest'
import { convertUnit, getUnitType, normalizeUnit } from '../../../server/utils/unitConverter'

describe('normalizeUnit', () => {
  it('maps common aliases to canonical units', () => {
    expect(normalizeUnit('Tablespoons')).toBe('tbsp')
    expect(normalizeUnit('grams')).toBe('grams')
    expect(normalizeUnit('pc')).toBe('pieces')
  })
})

describe('getUnitType', () => {
  it('classifies volume, weight, and count', () => {
    expect(getUnitType('cup')).toBe('volume')
    expect(getUnitType('oz')).toBe('weight')
    expect(getUnitType('pieces')).toBe('count')
  })
})

describe('convertUnit', () => {
  it('converts within the same type', () => {
    expect(convertUnit(1000, 'ml', 'l')).toBe(1)
    expect(convertUnit(1, 'kg', 'g')).toBe(1000)
  })

  it('returns null across incompatible types or count units', () => {
    expect(convertUnit(1, 'g', 'ml')).toBeNull()
    expect(convertUnit(2, 'pieces', 'cups')).toBeNull()
  })
})
