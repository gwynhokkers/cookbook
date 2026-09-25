export function isRecipeSourceUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

export interface ParsedRecipeSource {
  label: string
  book?: string
  author?: string
  isUrl: boolean
}

export interface SplitSourceAndUrl {
  source: string | null
  sourceUrl: string | null
}

/** Pull a trailing URL out of `Title (https://…)` or `Title https://…`. */
function extractTrailingUrl(source: string): { text: string; href?: string } {
  const parenMatch = source.match(/^(.*?)\s*\((https?:\/\/[^)\s]+)\)\s*$/i)
  if (parenMatch) {
    return { text: parenMatch[1].trim(), href: parenMatch[2] }
  }

  const bareMatch = source.match(/^(.*?)\s+(https?:\/\/\S+)\s*$/i)
  if (bareMatch) {
    return { text: bareMatch[1].trim(), href: bareMatch[2] }
  }

  return { text: source }
}

function hostnameLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * Split a legacy packed source string (or bare URL) into label + URL.
 * Used by backfill and form smart-paste — not for ongoing display parsing.
 */
export function splitSourceAndUrl(
  raw: string | null | undefined
): SplitSourceAndUrl {
  if (!raw?.trim()) return { source: null, sourceUrl: null }

  const trimmed = raw.trim()
  const { text, href: embeddedHref } = extractTrailingUrl(trimmed)

  if (isRecipeSourceUrl(text)) {
    return { source: hostnameLabel(text), sourceUrl: text }
  }

  const source = text.trim() || null
  return {
    source,
    sourceUrl: embeddedHref || null
  }
}

/**
 * Normalize an optional source URL for storage.
 * Empty → null. Non-empty must be http(s) or throws.
 */
export function normalizeSourceUrl(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  if (!isRecipeSourceUrl(trimmed)) {
    throw new Error('Source URL must start with http:// or https://')
  }
  try {
    // Validate URL shape
    // eslint-disable-next-line no-new
    new URL(trimmed)
  } catch {
    throw new Error('Source URL is not a valid URL')
  }
  return trimmed
}

/** Parse a human source label (book — author, or plain text). No URL extraction. */
export function parseRecipeSource(
  source: string | null | undefined
): ParsedRecipeSource | null {
  if (!source?.trim()) return null

  const trimmed = source.trim()

  if (isRecipeSourceUrl(trimmed)) {
    return {
      label: hostnameLabel(trimmed),
      isUrl: true
    }
  }

  const bookAuthorMatch = trimmed.match(/^(.+?)\s+[—–-]\s+(.+)$/)
  if (bookAuthorMatch) {
    const book = bookAuthorMatch[1].trim()
    const author = bookAuthorMatch[2].trim()
    return {
      label: `${book} — ${author}`,
      book,
      author,
      isUrl: false
    }
  }

  return { label: trimmed, isUrl: false }
}
