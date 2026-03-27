/**
 * Convert OCR / cookbook titles (often ALL CAPS) to readable title case.
 * British-style: minor words stay lowercase except the first word.
 */
const MINOR_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'but',
  'or',
  'nor',
  'for',
  'on',
  'at',
  'to',
  'from',
  'of',
  'in',
  'with',
  'as',
  'by',
  'per',
  'via',
  'vs',
  'v'
])

const capitaliseSegment = (segment: string): string => {
  if (!segment) return segment
  return segment.charAt(0).toUpperCase() + segment.slice(1)
}

export function toRecipeTitleCase(input: string): string {
  const s = input.trim().replace(/\s+/g, ' ')
  if (!s) return ''

  const words = s.split(/\s+/)
  return words
    .map((raw, index) => {
      if (/^[\d'"'’()[\].,]+$/.test(raw)) return raw
      const lower = raw.toLowerCase()
      if (index > 0 && MINOR_WORDS.has(lower)) {
        return lower
      }
      return lower
        .split('-')
        .map(capitaliseSegment)
        .join('-')
    })
    .join(' ')
}
