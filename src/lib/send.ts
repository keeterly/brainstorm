/**
 * Getting the work out of the app.
 *
 * The funnel ran a thought all the way to a finished buyer note and then
 * stopped an inch from the line: the note lived on a page inside an installed
 * PWA, and there was no way to put it in front of the buyer. "Concept to
 * execution" is not true if execution cannot be sent.
 *
 * Two ways out, in the order the phone prefers them. The share sheet is the
 * real one — it reaches Mail, Messages, Notes, a drafts app, anything — and it
 * only exists on a secure origin from inside a user gesture, which is why this
 * has to be called straight from the tap rather than after an await. The
 * clipboard is the fallback, and on a desktop it is usually the better answer
 * anyway.
 */
import { plainText } from './plain-text'

export type SentHow = 'shared' | 'copied' | 'cancelled' | 'failed'

/** True if this device can put things in front of other apps. */
export function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

/**
 * Put a piece of finished work somewhere a person can use it.
 *
 * Levelled to plain text on the way out. This used to hand over the raw
 * markdown, deliberately, on the argument that it "survives arriving somewhere
 * that understands it as headings and lists" — which is true of the places
 * that do, and the share sheet does not tell you which one you picked. The
 * commonest destination is Messages, and what landed there was
 * `# Beyond identifying the 3 target lenders…` followed by
 * `- [SBA 7(a) Paperwork Explained](https://…)`. A brief nobody can read is a
 * brief that did not leave the app.
 *
 * Done here rather than at each call site so there is one boundary and no way
 * for the next thing that sends work to forget.
 */
export async function sendWork(title: string, markdown: string): Promise<SentHow> {
  const text = plainText(markdown)
  if (!text) return 'failed'
  if (canShare()) {
    try {
      // `title` and `text` both: Mail uses the title as a subject line, and
      // everything else ignores it.
      await navigator.share({ title, text })
      return 'shared'
    } catch (e) {
      // Cancelling the sheet throws AbortError. That is not a failure and must
      // not be reported as one — it is the commonest outcome of opening a
      // share sheet and changing your mind.
      if ((e as Error)?.name === 'AbortError') return 'cancelled'
      // anything else: fall through to the clipboard rather than dead-ending
    }
  }
  return copyWork(text)
}

/** The other way out, and the one a desktop usually wants. */
export async function copyWork(markdown: string): Promise<SentHow> {
  const text = plainText(markdown)
  if (!text) return 'failed'
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}

/** What to say about what just happened. */
export function sentWord(how: SentHow): string | null {
  if (how === 'shared') return 'sent'
  if (how === 'copied') return 'copied — paste it anywhere'
  if (how === 'failed') return 'could not get it out just now'
  return null // cancelled: they changed their mind, and the app should not comment
}
