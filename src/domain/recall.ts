// Which of the things it knows about you are worth bringing to this.
//
// Every prompt used to carry the first sixty memories in the order they were
// written. That is the wrong sixty and it is always the same sixty: a fact
// about a supplier you mentioned once in March rode along on every request for
// the rest of the year, and the model paid attention to all of it equally,
// which is the same as paying attention to none of it.
//
// mem0's answer is a vector search. This is the same idea without the vector,
// and deliberately so: embedding every memory means an embedding vendor, a
// third API key, and every sentence about how this person works leaving the
// stack. For a corpus of tens-to-hundreds of short sentences, four cheap
// signals get most of the way there —
//
//   overlap  — words shared with what is being asked. The strongest signal
//              when it fires, and it often does not.
//   standing — a preference or a constraint applies to everything. "Works best
//              in the morning" is relevant to scheduling a shoot even though
//              they share no words at all, and no lexical measure will ever
//              find that. So the kinds that are always true carry a floor.
//   strength — how many times it has proved worth having.
//   freshness— when it was last actually leaned on, not when it was written.
//
// A vector column can sit beside this later and feed the same ranker. Nothing
// above this file would change.

/** What sort of thing this is, which is most of how it gets ranked. */
export type MemoryKind = 'preference' | 'constraint' | 'pattern' | 'fact' | 'person' | 'tool' | 'goal'

export const KINDS: MemoryKind[] = ['preference', 'constraint', 'pattern', 'fact', 'person', 'tool', 'goal']

export function isKind(s: unknown): s is MemoryKind {
  return typeof s === 'string' && (KINDS as string[]).includes(s)
}

/**
 * How much of this is true regardless of what is being asked.
 *
 * A preference and a constraint hold everywhere; a fact about one supplier
 * holds when that supplier comes up. This is the number that decides what rides
 * along on every prompt, so it is short and it is deliberate.
 */
const STANDING: Record<MemoryKind, number> = {
  // The three above the floor: these ride along on everything, because ignoring
  // them produces work that is wrong in a way the person told you how to avoid.
  constraint: 1, // "will not travel during production weeks"
  preference: 0.9, // "writes to buyers in plain sentences"
  pattern: 0.8, // "works best in the morning"
  // …and the four below it, which have to earn their place on the ask. A goal
  // is nearly there and gets over on reinforcement or freshness; a fact about
  // one supplier has to actually be about this.
  goal: 0.45,
  tool: 0.25,
  person: 0.2,
  fact: 0.15,
}

/**
 * A memory with no kind on it, which is every memory written before this
 * existed and every one that came in through the importer.
 *
 * Above the floor, deliberately. An unclassified memory is not one the app has
 * decided is unimportant — it is one it has never formed a view on, and the
 * safe reading of that is the behaviour it had before: carry it. Below
 * `pattern`, so anything actually classified, and anything that matched the
 * ask, goes first. The tail sorts itself out as the reconciler touches each one.
 */
const UNKNOWN_STANDING = 0.55

export interface Recallable {
  id: string
  content: string
  kind?: string | null
  strength?: number | null
  last_used_at?: string | null
  created_at?: string
}

// Words that appear in everything and so distinguish nothing. Short list on
// purpose: the risk of a stopword list is that it eats the one word that
// mattered, and "no" and "not" have been left in for exactly that reason.
const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this', 'these', 'those',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'do', 'does', 'did', 'have', 'has', 'had',
  'will', 'would', 'should', 'could', 'can', 'may', 'might', 'must', 'shall',
  'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'they', 'them', 'their', 'it', 'its',
  'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'as', 'into', 'about', 'over', 'out',
  'up', 'down', 'off', 'so', 'too', 'very', 'just', 'now', 'get', 'got', 'one', 'all', 'any', 'some',
  'what', 'which', 'who', 'when', 'where', 'how', 'there', 'here', 'more', 'most', 'other',
])

/**
 * The words worth matching on, roughly stemmed.
 *
 * Crude on purpose. A real stemmer is a dependency and a table of exceptions,
 * and the whole of what is needed here is that "mornings" finds "morning" and
 * "shooting" finds "shoot". Anything shorter than four letters keeps its tail,
 * because trimming "s" off "gas" is worse than missing a plural.
 */
export function tokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.toLowerCase().split(/[^a-z0-9']+/)) {
    const w = raw.replace(/'s$/, '')
    if (w.length < 3 || STOP.has(w)) continue
    out.add(stem(w))
  }
  return out
}

function stem(w: string): string {
  if (w.length <= 4) return w
  for (const suf of ['ingly', 'edly', 'ing', 'ies', 'ed', 'es', 's']) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      const base = w.slice(0, -suf.length)
      return suf === 'ies' ? base + 'y' : base
    }
  }
  return w
}

/** Shared words, as a fraction of the shorter side. */
function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let hit = 0
  for (const t of a) if (b.has(t)) hit++
  return hit / Math.min(a.size, b.size)
}

/** 0 at a year old, 1 today — used for how recently it was leaned on. */
function freshness(iso: string | null | undefined, nowMs: number): number {
  if (!iso) return 0
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 0
  const days = (nowMs - t) / 86400000
  if (days <= 0) return 1
  return Math.max(0, 1 - days / 365)
}

export interface Recalled {
  memory: Recallable
  score: number
  /** true when it came along because it is always true, not because it matched */
  standing: boolean
}

/**
 * Rank what it knows against what is being asked.
 *
 * `about` is whatever text the request is really about — the thought, the
 * question, the goal. Empty is allowed and means "no topic": what comes back is
 * then the standing memories, which is the right answer for a prompt that has
 * no subject rather than an excuse to send everything.
 */
export function rank(memories: Recallable[], about: string, nowMs = Date.now()): Recalled[] {
  const want = tokens(about)
  return memories
    .map((m) => {
      const standing = STANDING[m.kind as MemoryKind] ?? UNKNOWN_STANDING
      const hit = want.size ? overlap(want, tokens(m.content)) : 0
      // Reinforcement is a tiebreaker, not a ranking: something confirmed forty
      // times must not bury the one memory that is actually about this.
      const strong = Math.log1p(Math.max(0, (m.strength ?? 1) - 1)) / Math.log(20)
      const used = freshness(m.last_used_at ?? m.created_at, nowMs)
      return {
        memory: m,
        score: hit * 1.6 + standing + Math.min(strong, 1) * 0.25 + used * 0.15,
        standing: hit === 0,
      }
    })
    .sort((a, b) => b.score - a.score || a.memory.content.localeCompare(b.memory.content))
}

/**
 * The ones to actually send.
 *
 * Capped at `n` — the point of the exercise is a short list, and a prompt
 * carrying forty facts is one that carries none. Below `floor` nothing is worth
 * the tokens: an unmatched fact about a supplier is noise on a question about
 * fabric, and sending it teaches the model that most of what it is given can be
 * ignored.
 */
export function recall(memories: Recallable[], about: string, n = 12, nowMs = Date.now()): Recallable[] {
  // Set exactly between `pattern` and `goal`: the line above which a memory
  // rides along on everything, and below which it has to be about this.
  const floor = 0.5
  return rank(memories, about, nowMs)
    .filter((r) => r.score >= floor)
    .slice(0, n)
    .map((r) => r.memory)
}

/**
 * What the request is about, dug out of an action's own input.
 *
 * Every action is handed a different shape and none of them say "here is the
 * topic". Rather than teach twenty actions to declare one, walk the input and
 * take the words: titles, summaries, the text they typed. Ids and dates are
 * skipped — a uuid is not a topic, and matching on one would be worse than
 * matching on nothing.
 */
export function topicOf(input: unknown, depth = 0): string {
  if (depth > 4) return ''
  if (typeof input === 'string') return input.length > 400 ? input.slice(0, 400) : input
  if (Array.isArray(input)) return input.slice(0, 40).map((v) => topicOf(v, depth + 1)).join(' ')
  if (input && typeof input === 'object') {
    const out: string[] = []
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      // an id, a timestamp or a base64 image contributes nothing but noise
      if (/^(id|.*_id|tempId|due|.*_at|date|dataB64|mediaType|image)$/i.test(k)) continue
      const s = topicOf(v, depth + 1)
      if (s) out.push(s)
    }
    return out.join(' ')
  }
  return ''
}
