export function formatEstimatedMinutes(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null
  const total = Math.round(minutes)
  const hours = Math.floor(total / 60)
  const mins = total % 60
  if (hours === 0) return `${total} min`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

export function normalizeEstimatedMinutes(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(1440, Math.max(1, Math.round(n)))
}
