/**
 * Parse a servings/yield value into a positive integer.
 * Handles "Serves 4", "Makes 6-8", raw numbers, etc.
 */
export function parseServings(value: string | number | null | undefined): number | undefined {
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

/**
 * Validate and normalize servings for API persistence.
 * Returns null when the field should be cleared.
 */
export function normalizeServingsForStorage(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const parsed = parseServings(
    typeof value === 'number' || typeof value === 'string' ? value : String(value)
  )
  return parsed ?? null
}
