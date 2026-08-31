export function formatEstimatedMinutes(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null
  const total = Math.round(minutes)
  const hours = Math.floor(total / 60)
  const mins = total % 60
  if (hours === 0) return `${total} min`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}
