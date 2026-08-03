// Handing one thought to somebody else.
//
// What travels is the thinking, not the bubble: the words, what is inside it,
// what you have absorbed into it, and what the agent found out — in the order
// you would say them out loud. Plain text, because the person receiving it is
// in a message app and has never heard of this one, and a link they cannot
// open is worse than no link.
//
// Deliberately not a share *of the graph*. Nothing here grants anybody access
// to anything: it is a copy, taken at a moment, that stops being connected to
// you the instant it leaves. Real shared thinking — they see it in their own
// sky, edits find their way back — is a different feature with a different
// threat model, and pretending this is that would be the dishonest version.

export interface Shareable {
  title: string
  /** the thought's own words, when they say more than the title does */
  body?: string | null
  /** what it holds, already in the order the group page shows */
  inside?: string[]
  /** what you have told it — see the "say" moon */
  answers?: string[]
  /** what the agent came back with, as markdown */
  brief?: string | null
  sources?: { title: string; url: string }[]
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * The agent writes markdown. A message bubble does not read it.
 *
 * What went out was raw: `# The wall is about mass without edges`, `##  What
 * runs through it`, `- **a single dark form**`. Seen in somebody's Messages
 * thread, that is not a thought you shared, it is a file you leaked. Headings
 * become plain lines, emphasis is dropped, bullets become the one bullet this
 * app uses everywhere, and a link becomes its words with the address after
 * them — because a bare `[text](url)` is unreadable and a bare url is
 * untrustworthy.
 */
export function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .split('\n')
    .map((raw) => {
      let l = raw.trimEnd()
      l = l.replace(/^\s{0,3}#{1,6}\s+/, '')
      l = l.replace(/^\s*[-*+]\s+/, '· ')
      l = l.replace(/^\s*(\d+)\.\s+/, '$1. ')
      l = l.replace(/^\s*>\s?/, '')
      // [words](url) → words (url); an image is not text at all
      l = l.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      l = l.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
      l = l.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
      l = l.replace(/__([^_]+)__/g, '$1')
      l = l.replace(/`([^`]+)`/g, '$1')
      l = l.replace(/^\s*([-*_])\1{2,}\s*$/, '')
      return l.trimEnd()
    })
    .join('\n')
    // three or more blank lines is what stripping a heading leaves behind
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * One thought, as something you could paste into a message.
 *
 * Every section is dropped when it is empty rather than printed as a heading
 * with nothing under it — a share of a bare drop should be one line, not a
 * form with four blanks in it.
 */
export function shareText(s: Shareable): string {
  const out: string[] = []
  const title = clean(s.title)
  out.push(title)

  const body = clean(s.body ?? '')
  // only when it is genuinely more than the title: a drop's body and its
  // title are usually the same sentence, and saying it twice reads as a bug
  if (body && body !== title) out.push('', body)

  const inside = (s.inside ?? []).map(clean).filter(Boolean)
  if (inside.length) out.push('', ...inside.map((l) => `· ${l}`))

  const answers = (s.answers ?? []).map(clean).filter(Boolean)
  if (answers.length) out.push('', 'What I know:', ...answers.map((l) => `· ${l}`))

  // the agent's markdown, as something a message bubble can show
  const brief = plainText(s.brief ?? '')
  if (brief) out.push('', brief)

  /*
   * …unless the brief already cited them, which it usually has.
   *
   * The agent writes its own "## Sources" at the foot of what it found, and
   * appending the column as well printed every link twice — the second time
   * as "url — url" for anything whose title was the url. The same rule the
   * copy-a-brief path uses (see `sendable`), for the same reason.
   */
  // Matched against the *cleaned* brief: the heading was "## Sources" in the
  // markdown and is a bare "Sources" line by the time it gets here, so the
  // old check for the hashes stopped matching the moment the markdown started
  // being stripped — and every link went back to printing twice.
  const cited = /^sources:?\s*$/im.test(brief)
  const sources = (s.sources ?? []).filter((r) => r.url)
  if (sources.length && !cited) {
    out.push('', 'Sources:')
    for (const r of sources) {
      const name = clean(r.title)
      out.push(name && name !== r.url ? `· ${name} — ${r.url}` : `· ${r.url}`)
    }
  }
  return out.join('\n').trim()
}

/** What the share sheet calls it. Kept short: a title, not the thought. */
export function shareTitle(title: string): string {
  const t = clean(title)
  return t.length > 60 ? `${t.slice(0, 59)}…` : t
}

export type ShareHow = 'shared' | 'copied' | 'cancelled' | 'failed'

/**
 * Can this phone hand over a picture at all?
 *
 * Asked with the actual file, because `canShare` answers about the payload
 * rather than in general — desktop Chrome will share text and refuse files,
 * and a card built for a share sheet that then rejects it is a spinner and an
 * apology.
 */
export function canSendPicture(file: File): boolean {
  const nav = typeof navigator === 'undefined' ? null : navigator
  return !!nav?.canShare?.({ files: [file] }) && !!nav?.share
}

/**
 * Out through whatever the phone offers, or onto the clipboard when it offers
 * nothing.
 *
 * Cancelling is not failing. The share sheet rejects with `AbortError` when
 * somebody swipes it away, and treating that as an error made the app
 * apologise for doing exactly what was asked of it.
 */
export async function handOver(text: string, title: string, picture?: File | null): Promise<ShareHow> {
  const nav = typeof navigator === 'undefined' ? null : navigator
  if (nav?.share) {
    try {
      // the picture when the phone will take one, and the words either way —
      // they are the part somebody can reply to
      await (picture && canSendPicture(picture)
        ? nav.share({ title, text, files: [picture] })
        : nav.share({ title, text }))
      return 'shared'
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled'
      // fall through: a share sheet that refuses for any other reason is
      // still no reason to lose the words
    }
  }
  // Checked before it is claimed. `nav?.clipboard?.writeText(text)` on a
  // browser with no clipboard API short-circuits to undefined and throws
  // nothing — so this returned "copied" and the app said "paste it wherever
  // you like" with nothing on the clipboard at all.
  if (!nav?.clipboard?.writeText) return 'failed'
  try {
    await nav.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
