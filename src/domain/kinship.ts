// How alike two thoughts are.
//
// The sky uses this to decide two different things: whether to draw a thread
// between two thoughts, and whether to actually merge them into a pool. The
// second one moves your work, so it had better be right.
//
// It used to count shared words. Three things were wrong with that, and all
// three pushed the same way — toward saying yes:
//
//   A pool stood for every word in every thought inside it, so a pool with
//   twenty members shared a word with nearly everything in the sky.
//
//   A word counted the same whether it appeared in one thought or in all of
//   them. "design" and "venia" are in half of this user's sky; matching on them
//   says nothing at all, and yet it counted double if you matched on both.
//
//   Nothing was divided by anything, so a long title scored higher than a short
//   one just for having more words to be lucky with.
//
// So: weight every word by how rare it is, and compare directions rather than
// totals. A pool with twenty members has a long vector, and a small drop that
// happens to touch two of its words points almost nowhere near it — which is
// the answer we wanted and never got.

const STOP = new Set([
  // function words first: three letters is the shortest we keep, and most of
  // what that lets through carries nothing
  'and', 'any', 'are', 'but', 'can', 'did', 'for', 'get', 'got', 'had', 'has', 'her', 'him',
  'his', 'its', 'let', 'not', 'nor', 'off', 'our', 'out', 'own', 'per', 'put', 'she', 'the',
  'too', 'use', 'via', 'was', 'way', 'who', 'why', 'yet', 'you',
  'about', 'after', 'again', 'against', 'also', 'always', 'another', 'anything', 'around',
  'because', 'been', 'before', 'being', 'better', 'between', 'both', 'build', 'built',
  'came', 'come', 'could', 'does', 'doing', 'done', 'down', 'each', 'else', 'even', 'ever',
  'every', 'from', 'gets', 'give', 'goes', 'going', 'gone', 'have', 'here', 'himself',
  'into', 'itself', 'just', 'keep', 'kind', 'know', 'less', 'like', 'look', 'made', 'make',
  'many', 'maybe', 'mine', 'more', 'most', 'much', 'must', 'need', 'never', 'next', 'none',
  'only', 'onto', 'other', 'ours', 'over', 'part', 'perhaps', 'really', 'said', 'same',
  'says', 'seem', 'shall', 'should', 'since', 'some', 'somehow', 'something', 'still',
  'such', 'sure', 'take', 'than', 'that', 'thats', 'their', 'them', 'then', 'there',
  'these', 'they', 'thing', 'think', 'this', 'those', 'through', 'time', 'together', 'told',
  'took', 'toward', 'under', 'until', 'upon', 'used', 'uses', 'using', 'very', 'want',
  'well', 'went', 'were', 'what', 'when', 'where', 'which', 'while', 'will', 'with',
  'within', 'without', 'work', 'would', 'your', 'yours',
])

/**
 * Fold a word to its stem, crudely and on purpose.
 *
 * "collection" and "collections" are the same word to a person and were two
 * different words to the old scoring. A real stemmer would be a dependency and
 * a surprise; this handles the endings that actually cost us matches and leaves
 * everything else alone. Short words are never cut, so "less" does not become
 * "les" and "using" does not become "us".
 */
export function stem(w: string): string {
  if (w.length > 6 && w.endsWith('ations')) return w.slice(0, -6)
  if (w.length > 5 && w.endsWith('ation')) return w.slice(0, -5)
  if (w.length > 5 && w.endsWith('ings')) return w.slice(0, -4)
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 5 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.length > 5 && w.endsWith('iness')) return w.slice(0, -5) + 'y'
  if (w.length > 5 && w.endsWith('ness')) return w.slice(0, -4)
  if (w.length > 5 && (w.endsWith('es') || w.endsWith('ed'))) return w.slice(0, -2)
  if (w.length > 4 && w.endsWith('ly')) return w.slice(0, -2)
  if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

/** The words in a piece of text that carry any meaning, stemmed. */
export function terms(text: string): string[] {
  const out: string[] = []
  for (const raw of String(text || '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3) continue
    if (STOP.has(raw)) continue
    const s = stem(raw)
    if (s.length < 3 || STOP.has(s)) continue
    out.push(s)
  }
  return out
}

export interface Doc {
  id: string
  /** what this thing is called — worth more than what is inside it */
  title: string
  /** the things inside it, if it is a group */
  inside?: string[]
}

/** A document as a bag of terms with counts. A group's own name counts double:
 *  it is the thing the group is about, and a member is only an example of it. */
function bag(d: Doc): Map<string, number> {
  const m = new Map<string, number>()
  const add = (t: string, n: number) => m.set(t, (m.get(t) ?? 0) + n)
  for (const t of terms(d.title)) add(t, 2)
  for (const text of d.inside ?? []) for (const t of terms(text)) add(t, 1)
  return m
}

export interface Kinship {
  /** How alike two of the indexed documents are, 0 → 1. Symmetric. */
  score(a: string, b: string): number
  /**
   * How much of `part` the `whole` already accounts for, 0 → 1.
   *
   * Not the same question as how alike they are, and pooling is this question.
   * A group of eight is not "like" any one thought that belongs in it — most of
   * what the group is about is the other seven — so asking how alike they are
   * says no to things that plainly belong. What matters is the other direction:
   * of everything this one thought is about, how much is the group already
   * about. Everything, for a member. Nothing, for a stranger. And a big group
   * gets no advantage from being big, because the size that would flatter it
   * is not in the denominator.
   */
  belongs(part: string, whole: string): number
  /** How much of `part`'s meaning the match actually carried — in rare-word
   *  weight, not as a share. A one-word thought can be wholly contained by
   *  accident; this is how much that containment was worth. */
  evidence(part: string, whole: string): number
  /** The terms two documents actually have in common, rarest first — what you
   *  would name the thing they turn into. */
  common(a: string, b: string): string[]
  /** Everything kin to one document, closest first. */
  nearest(id: string, min?: number): { id: string; score: number }[]
  ids: string[]
}

/**
 * Index a set of documents and answer questions about them.
 *
 * Built once per change to the sky rather than per question, because the rarity
 * of a word is a property of the whole sky and cannot be known from a pair.
 */
export function kinship(docs: Doc[]): Kinship {
  const n = Math.max(1, docs.length)
  const df = new Map<string, number>()
  const bags = new Map<string, Map<string, number>>()
  for (const d of docs) {
    const b = bag(d)
    bags.set(d.id, b)
    for (const t of b.keys()) df.set(t, (df.get(t) ?? 0) + 1)
  }
  // A word in every thought tells you nothing; a word in one tells you a lot.
  // Smoothed so that a word in every single document lands at zero rather than
  // going negative, and so a two-document sky does not divide by nothing.
  const idf = (t: string) => Math.log((n + 1) / ((df.get(t) ?? 0) + 0.5))

  const vecs = new Map<string, { w: Map<string, number>; norm: number }>()
  for (const [id, b] of bags) {
    const w = new Map<string, number>()
    let sq = 0
    for (const [t, count] of b) {
      // sub-linear in the count: saying "film" four times does not make a
      // thought four times as much about film
      const v = (1 + Math.log(count)) * idf(t)
      if (v <= 0) continue
      w.set(t, v)
      sq += v * v
    }
    vecs.set(id, { w, norm: Math.sqrt(sq) })
  }

  const score = (a: string, b: string) => {
    if (a === b) return 1
    const va = vecs.get(a)
    const vb = vecs.get(b)
    if (!va || !vb || !va.norm || !vb.norm) return 0
    // walk the shorter one
    const [small, big] = va.w.size <= vb.w.size ? [va, vb] : [vb, va]
    let dot = 0
    for (const [t, v] of small.w) {
      const o = big.w.get(t)
      if (o) dot += v * o
    }
    return Math.max(0, Math.min(1, dot / (va.norm * vb.norm)))
  }

  const matched = (part: string, whole: string) => {
    const vp = vecs.get(part)
    const vw = vecs.get(whole)
    if (!vp || !vw) return { hit: 0, all: 0 }
    let hit = 0
    let all = 0
    for (const [t, v] of vp.w) {
      all += v
      if (vw.w.has(t)) hit += v
    }
    return { hit, all }
  }

  return {
    ids: docs.map((d) => d.id),
    score,
    belongs(part, whole) {
      if (part === whole) return 1
      const { hit, all } = matched(part, whole)
      return all > 0 ? Math.max(0, Math.min(1, hit / all)) : 0
    },
    evidence(part, whole) {
      return matched(part, whole).hit
    },
    common(a, b) {
      const va = vecs.get(a)
      const vb = vecs.get(b)
      if (!va || !vb) return []
      const shared: { t: string; v: number }[] = []
      for (const [t, v] of va.w) {
        const o = vb.w.get(t)
        if (o) shared.push({ t, v: Math.min(v, o) })
      }
      return shared.sort((x, y) => y.v - x.v).map((x) => x.t)
    },
    nearest(id, min = 0) {
      const out: { id: string; score: number }[] = []
      for (const d of docs) {
        if (d.id === id) continue
        const s = score(id, d.id)
        if (s > min) out.push({ id: d.id, score: s })
      }
      return out.sort((a, b) => b.score - a.score)
    },
  }
}

/**
 * Enough alike to draw a thread between them: a suggestion, costs nothing if
 * it is wrong, and you can see it and disagree.
 */
// Measured on a real sky rather than picked: across the author's own two big
// groups and eight loose thoughts, everything that genuinely belonged scored
// 0.43 to 0.75 and every stranger scored 0.00, with the nearest near-miss at
// 0.19. These sit in the gap.
export const KIN_THREAD = 0.09

/**
 * Enough of a thought accounted for by a group to put it inside that group.
 * This moves your work, so it asks that most of what the thought is about is
 * what the group is about — not that they have a word in common.
 */
export const KIN_POOL = 0.38

/**
 * …and enough of it to be worth anything. Containment alone will happily swallow
 * a two-word thought on a single lucky match, so the match also has to carry
 * real weight in rare words. Roughly: one genuinely distinctive word, or two
 * middling ones.
 */
export const KIN_EVIDENCE = 2.2
