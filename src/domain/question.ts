// Which things on the map are questions, and which are work.
//
// The map does not distinguish them, and it should. "Pull live Google Flights /
// ITA Matrix fares for LAX→CDG premium economy, Sept 28 out / Oct 9 back" and
// "Book once fare/award is confirmed reasonable" sit side by side as identical
// drops, and ⚡ offers both of them the same thing: a plan. One of them wants a
// plan. The other one wants a number.
//
// So this is the smallest honest test of which is which, and it is deliberately
// a plain function rather than a model call: it runs on every drop in the sky
// on every paint, it has to be the same answer every time, and being wrong here
// costs a wasted minute of research — which is exactly the kind of thing you
// want written down and tested rather than inferred fresh each time.
//
// The rule is the opening verb. English is generous here: the verbs that mean
// "find out" (check, pull, confirm, compare, look up) are a different set from
// the verbs that mean "do" (book, file, send, build), and a sentence ending in
// a question mark has already told you.

/** Verbs that open a lookup: what follows is something to be found out. */
const ASKING = [
  'check',
  'confirm',
  'verify',
  'validate',
  'find out',
  'find',
  'look up',
  'lookup',
  'look into',
  'pull',
  'price',
  'quote',
  'compare',
  'research',
  'investigate',
  'figure out',
  'work out',
  'work-out',
  'see if',
  'see whether',
  'see what',
  'determine',
  'establish whether',
  'read up on',
  'ask',
  'double check',
  'double-check',
  'sanity check',
  'sanity-check',
]

/** Question words: a sentence opening with one of these is asking, mark or no mark. */
const INTERROGATIVE = [
  'what',
  'which',
  'who',
  'whose',
  'whom',
  'when',
  'where',
  'why',
  'how',
  'is',
  'are',
  'was',
  'were',
  'do',
  'does',
  'did',
  'can',
  'could',
  'should',
  'would',
  'will',
  'am',
  'have',
  'has',
]

/**
 * Verbs that open work. Listed explicitly rather than left to the default,
 * because several of them shade toward looking — "review the contract" is
 * reading, but it is reading *you* do — and the default has to be "this is
 * work" so that a misread never hijacks something you meant to go and do.
 */
const DOING = [
  'book',
  'buy',
  'file',
  'send',
  'email',
  'call',
  'write',
  'draft',
  'build',
  'make',
  'set',
  'set up',
  'schedule',
  'pay',
  'sign',
  'submit',
  'apply',
  'order',
  'ship',
  'post',
  'publish',
  'launch',
  'finish',
  'fix',
  'update',
  'review',
  'follow up',
  'follow-up',
  'reach out',
  'meet',
  'plan',
  'prep',
  'prepare',
]

/** The first clause, lowered and stripped of the punctuation people lead with. */
function opening(text: string): string {
  return text
    .trim()
    .replace(/^[\s\-–—•*+\d.)\]}"'“”[(]+/, '')
    .toLowerCase()
}

/** Does `s` begin with `phrase` as a whole word (or phrase)? */
const opensWith = (s: string, phrase: string) =>
  s.startsWith(phrase) && (s.length === phrase.length || /[\s,:;/–—-]/.test(s[phrase.length]))

/**
 * Does this thought want an answer rather than an afternoon?
 *
 * True for anything that ends in a question mark, opens with a question word,
 * or opens with a verb that means "find out". False by default: when it is not
 * clearly a question, treat it as work, because offering to answer a task is a
 * worse mistake than offering to plan a question.
 */
export function isQuestion(text: string | null | undefined): boolean {
  const raw = (text ?? '').trim()
  if (!raw) return false
  // A question mark anywhere in the first line settles it. Anywhere, because
  // "Which carrier — AF or DL? and at what fare" is one question with a tail.
  const firstLine = raw.split('\n')[0]
  if (firstLine.includes('?')) return true

  const s = opening(raw)
  if (!s) return false

  // A do-verb wins over everything below it: "Set a fare alert (Google Flights
  // tracking or Going.com)" is work, whatever the rest of it mentions.
  for (const v of DOING) if (opensWith(s, v)) return false
  for (const v of ASKING) if (opensWith(s, v)) return true
  for (const w of INTERROGATIVE) if (opensWith(s, w)) return true
  return false
}

/**
 * What to call the act of going and getting it — so one label can serve both
 * kinds of thing without the sky growing a seventh button.
 */
export function workLabel(text: string | null | undefined): 'answer it' | 'work it' {
  return isQuestion(text) ? 'answer it' : 'work it'
}
