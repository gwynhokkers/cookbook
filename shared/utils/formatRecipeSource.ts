export function isRecipeSourceUrl(source: string): boolean {
  return /^https?:\/\//i.test(source.trim());
}

export interface ParsedRecipeSource {
  label: string;
  book?: string;
  author?: string;
  href?: string;
  isUrl: boolean;
}

export function parseRecipeSource(
  source: string | null | undefined,
): ParsedRecipeSource | null {
  if (!source?.trim()) return null;

  const trimmed = source.trim();

  if (isRecipeSourceUrl(trimmed)) {
    let label = trimmed;
    try {
      label = new URL(trimmed).hostname.replace(/^www\./, "");
    } catch {
      /* keep full URL */
    }
    return { label, href: trimmed, isUrl: true };
  }

  const bookAuthorMatch = trimmed.match(/^(.+?)\s+[—–-]\s+(.+)$/);
  if (bookAuthorMatch) {
    const book = bookAuthorMatch[1].trim();
    const author = bookAuthorMatch[2].trim();
    return {
      label: `${book} — ${author}`,
      book,
      author,
      isUrl: false,
    };
  }

  return { label: trimmed, isUrl: false };
}
