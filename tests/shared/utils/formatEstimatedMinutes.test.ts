import { describe, expect, it } from 'vitest'
import { formatEstimatedMinutes } from '~~/shared/utils/formatEstimatedMinutes'

describe('formatEstimatedMinutes', () => {
  it('returns null for empty values', () => {
    expect(formatEstimatedMinutes(null)).toBeNull()
    expect(formatEstimatedMinutes(undefined)).toBeNull()
  })

  it('formats minutes only', () => {
    expect(formatEstimatedMinutes(45)).toBe('45 min')
  })

  it('formats hours and minutes', () => {
    expect(formatEstimatedMinutes(90)).toBe('1h 30m')
    expect(formatEstimatedMinutes(120)).toBe('2h')
  })
})
