// Dates people say out loud. "2026-08-02" is a machine's answer to a human
// question — inside the world a date should read the way you'd speak it.
const DAY = 86400000

function parseDay(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export function humanDate(iso: string, todayIso: string): string {
  const d = parseDay(iso)
  const today = parseDay(todayIso)
  if (!d || !today) return iso
  const days = Math.round((d.getTime() - today.getTime()) / DAY)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days < -1) return `${-days} days ago`
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  if (d.getFullYear() === today.getFullYear()) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// The same date, said as a deadline.
export function humanDue(iso: string, todayIso: string): string {
  const d = parseDay(iso)
  const today = parseDay(todayIso)
  if (!d || !today) return `due ${iso}`
  const days = Math.round((d.getTime() - today.getTime()) / DAY)
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} late`
  if (days === 0) return 'due today'
  if (days === 1) return 'due tomorrow'
  return `due ${humanDate(iso, todayIso)}`
}
