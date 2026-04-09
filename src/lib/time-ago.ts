/**
 * timeAgo — human-readable relative time from an ISO 8601 string.
 *
 * Used by the wiki index and individual wiki page routes to display
 * "Updated 3 days ago" timestamps from git commit dates.
 */
export function timeAgo(isoString: string): string {
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diffMs = now - then

  if (diffMs < 0) return 'just now'

  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours   = Math.floor(minutes / 60)
  const days    = Math.floor(hours / 24)
  const weeks   = Math.floor(days / 7)
  const months  = Math.floor(days / 30)
  const years   = Math.floor(days / 365)

  if (seconds < 60)  return 'just now'
  if (minutes < 60)  return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  if (hours < 24)    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  if (days < 7)      return `${days} day${days === 1 ? '' : 's'} ago`
  if (weeks < 5)     return `${weeks} week${weeks === 1 ? '' : 's'} ago`
  if (months < 12)   return `${months} month${months === 1 ? '' : 's'} ago`
  return `${years} year${years === 1 ? '' : 's'} ago`
}
