// Natural-language due dates at the END of a line set the due date and are
// stripped from the text: "by friday", "due jul 31", "tomorrow", "next week",
// "in 2 weeks", "eom". Faithful port of the proven VENIA implementation.
export interface NLDateResult {
  due: string | null // YYYY-MM-DD
  text: string
}

const WD_MAP: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  tues: 2,
  wed: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  fri: 5,
  sat: 6,
}
const MO = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const TAIL =
  /(?:\s*[,—–-]?\s*)(?:by|due|before|until)?\s*(today|tonight|tomorrow|next week|end of month|eom|in\s+(\d+)\s+(day|days|week|weeks)|(?:next\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*|(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})|(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*)\s*$/i

function localISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseNLDate(text: string, now: Date = new Date()): NLDateResult {
  let t = String(text || '')
  let due: string | null = null
  const today = () => {
    const d = new Date(now)
    d.setHours(12, 0, 0, 0)
    return d
  }
  const m = t.match(TAIL)
  if (m) {
    let d = today()
    const phrase = m[1].toLowerCase()
    if (phrase === 'today' || phrase === 'tonight') {
      due = localISO(d)
    } else if (phrase === 'tomorrow') {
      d.setDate(d.getDate() + 1)
      due = localISO(d)
    } else if (phrase === 'next week') {
      d.setDate(d.getDate() + 7)
      due = localISO(d)
    } else if (phrase === 'end of month' || phrase === 'eom') {
      d = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)
      due = localISO(d)
    } else if (m[2]) {
      d.setDate(d.getDate() + parseInt(m[2], 10) * (/week/.test(m[3]) ? 7 : 1))
      due = localISO(d)
    } else if (m[4]) {
      const wd = WD_MAP[m[4].toLowerCase()]
      const delta = (wd - d.getDay() + 7) % 7 || 7 // "friday" = the NEXT friday, never today
      d.setDate(d.getDate() + delta)
      due = localISO(d)
    } else if (m[5] && m[6]) {
      const mi = MO.indexOf(m[5].toLowerCase().slice(0, 3))
      d = new Date(d.getFullYear(), mi, parseInt(m[6], 10), 12)
      if (d < today()) d.setFullYear(d.getFullYear() + 1)
      due = localISO(d)
    } else if (m[7] && m[8]) {
      const mi = MO.indexOf(m[8].toLowerCase().slice(0, 3))
      d = new Date(d.getFullYear(), mi, parseInt(m[7], 10), 12)
      if (d < today()) d.setFullYear(d.getFullYear() + 1)
      due = localISO(d)
    }
    if (due) {
      const stripped = t
        .slice(0, m.index)
        .replace(/[\s,—–-]+$/, '')
        .trim()
      t = stripped || t
    }
  }
  return { due, text: t }
}
