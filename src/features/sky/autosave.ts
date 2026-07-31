// Nothing you have typed should depend on you leaving the field.
//
// Every editable thing on the group page committed on blur: change the wording
// of a step, or a group's name, and it reached the graph when — and only when —
// you tapped somewhere else, pressed return, or closed the page. Which is fine
// until it isn't. An installed PWA on a phone is killed constantly: you switch
// apps to check something, iOS reclaims the tab, and the sentence you had just
// rewritten was never anywhere but in a DOM node. The capture box has been
// safe from this for a while — it writes a draft to localStorage as you type —
// and the rows beside it, which hold the same kind of words, were not.
//
// Three rules, and the third is the one that makes this different from a
// debounce anybody could write in the page:
//
//   1. **It saves quietly.** Straight to the store, no undo bar, no toast, no
//      rebuild. A save you have to acknowledge every six hundred milliseconds
//      is worse than no save at all.
//   2. **It flushes when the page goes away.** `visibilitychange` is the last
//      moment an iOS PWA is reliably alive, so anything still waiting on its
//      timer is written there and then. Waiting for `pagehide` is too late on
//      that platform, and `beforeunload` never fires at all.
//   3. **Undo is per edit, not per keystroke.** The field remembers what it
//      held when you started, so leaving it offers to put back the sentence you
//      had before you began — not the one that existed a debounce ago, which is
//      what saving as you type would otherwise reduce undo to.
import { useGraph } from '@/store/graph'

/** Long enough not to write on every letter, short enough to lose nothing. */
export const SETTLE_MS = 600

type Pending = { id: string; text: string }

const waiting = new Map<string, Pending>()
let timer: ReturnType<typeof setTimeout> | null = null

function write({ id, text }: Pending) {
  const s = useGraph.getState()
  const t = s.thoughts.find((x) => x.id === id)
  const next = text.trim()
  // An empty field is somebody midway through retyping a line, not somebody
  // asking for a thought with no words in it. It is left alone until they are
  // done — blur is where "" is finally refused, the same as before.
  if (!t || !next || next === (t.title ?? '')) return
  s.updateThought(id, { title: next, raw_content: next })
}

/** Write everything still waiting, now. */
export function flushEdits(): void {
  if (timer) clearTimeout(timer)
  timer = null
  const all = [...waiting.values()]
  waiting.clear()
  for (const p of all) write(p)
}

/** Note that a field has changed, and save it once the typing settles. */
export function keepEdit(id: string, text: string): void {
  waiting.set(id, { id, text })
  if (timer) clearTimeout(timer)
  timer = setTimeout(flushEdits, SETTLE_MS)
}

/** Drop what is waiting for one thing, for when something else has taken it. */
export function forgetEdit(id: string): void {
  waiting.delete(id)
}

/** Is there typing that has not reached the graph yet? */
export function editsPending(): boolean {
  return waiting.size > 0
}

/** Wire the last-moment flush. Returns the undo, for the page's own teardown. */
export function watchForLeaving(): () => void {
  const onHide = () => {
    if (document.visibilityState === 'hidden') flushEdits()
  }
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', flushEdits)
  return () => {
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('pagehide', flushEdits)
  }
}

/** Tests only — the queue is process-wide by design. */
export function __reset(): void {
  if (timer) clearTimeout(timer)
  timer = null
  waiting.clear()
}
