import { describe, expect, it } from 'vitest'
import { rank, recall, ridesAlong, tokens, topicOf } from './recall'

const NOW = Date.parse('2026-07-30T12:00:00Z')
const days = (n: number) => new Date(NOW - n * 86400000).toISOString()

// The real memory of the person this was built for, plus the two shapes that
// broke the old code: a standing rule that shares no words with the ask, and a
// one-off fact that rode along on every prompt for a year.
const MEM = [
  { id: 'm1', content: 'Two-person label based in Los Angeles', kind: 'fact', strength: 4, created_at: days(120) },
  { id: 'm2', content: 'Works best in the morning', kind: 'pattern', strength: 9, last_used_at: days(2), created_at: days(200) },
  { id: 'm3', content: 'Writes to buyers in plain sentences, never bullet lists', kind: 'preference', strength: 3, created_at: days(30) },
  { id: 'm4', content: 'Will not travel during production weeks', kind: 'constraint', strength: 2, created_at: days(60) },
  { id: 'm5', content: 'The Como silk mill is called Setificio Verdi', kind: 'fact', strength: 1, created_at: days(300) },
  { id: 'm6', content: 'Uses Shopify for the storefront', kind: 'tool', strength: 1, created_at: days(90) },
]

describe('picking what to bring to an ask', () => {
  it('finds the memory that is actually about it', () => {
    const got = recall(MEM, 'Which silk mill did we use for the SS27 shells?', 12, NOW)
    expect(got.map((m) => m.id)).toContain('m5')
  })

  it('carries a standing rule that shares no words with the ask', () => {
    // the case no lexical measure can find, and the reason kinds exist at all:
    // scheduling a shoot and "works best in the morning" have nothing in common
    const got = recall(MEM, 'Book the photographer for the SS27 shoot', 12, NOW)
    expect(got.map((m) => m.id)).toContain('m2')
    expect(got.map((m) => m.id)).toContain('m4')
  })

  it('leaves a one-off fact behind when it has nothing to do with the ask', () => {
    // "Uses Shopify" on a question about fabric is the exact thing that made
    // sixty memories on every prompt worth nothing
    const got = recall(MEM, 'Draft the buyer note for SS27', 12, NOW)
    expect(got.map((m) => m.id)).not.toContain('m6')
    // …while what it is for does come
    expect(got.map((m) => m.id)).toContain('m3')
  })

  it('puts what the ask is about above what is merely always true', () => {
    const [first] = rank(MEM, 'What is the name of the silk mill in Como?', NOW)
    expect(first.memory.id).toBe('m5')
    expect(first.standing).toBe(false)
  })

  it('sends only the standing ones when the ask has no subject', () => {
    const got = recall(MEM, '', 12, NOW)
    const kinds = got.map((m) => m.kind)
    expect(kinds).toContain('constraint')
    expect(kinds).toContain('preference')
    expect(got.map((m) => m.id)).not.toContain('m5')
  })

  it('still carries a memory nobody has classified yet', () => {
    // everything written before kinds existed, and everything the importer
    // brought in. Never classified is not the same as judged unimportant, and
    // the safe reading of it is the behaviour that came before.
    const legacy = [{ id: 'old', content: 'Prefers to ship on a Tuesday', created_at: days(400) }]
    expect(recall(legacy, 'Book the photographer', 12, NOW).map((m) => m.id)).toEqual(['old'])
  })

  it('puts a classified memory in front of an unclassified one', () => {
    const mixed = [
      { id: 'old', content: 'Something from the old app', created_at: days(400) },
      { id: 'new', content: 'Will not travel during production weeks', kind: 'constraint', created_at: days(400) },
    ]
    expect(rank(mixed, 'Book the photographer', NOW)[0].memory.id).toBe('new')
  })

  it('keeps the list short, which is the whole point of it', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      id: `x${i}`,
      content: `Something about the campaign number ${i}`,
      kind: 'fact',
      strength: 1,
      created_at: days(10),
    }))
    expect(recall(many, 'the campaign', 12, NOW).length).toBeLessThanOrEqual(12)
  })

  it('lets reinforcement break a tie without letting it decide the ranking', () => {
    const pair = [
      { id: 'a', content: 'Ships to Japan twice a year', kind: 'fact', strength: 40, created_at: days(10) },
      { id: 'b', content: 'The Como silk mill is called Setificio Verdi', kind: 'fact', strength: 1, created_at: days(10) },
    ]
    // 'a' has been confirmed forty times and 'b' once; the question is about 'b'
    expect(rank(pair, 'which silk mill in Como', NOW)[0].memory.id).toBe('b')
  })

  it('matches across a plural or an -ing, which is most of what people type', () => {
    expect(tokens('shooting the lookbooks').has('shoot')).toBe(true)
    expect(tokens('lookbook').has('lookbook')).toBe(true)
    expect(recall(MEM, 'mornings', 12, NOW).map((m) => m.id)).toContain('m2')
  })

  it('does not trim a short word into a different one', () => {
    // "gas" must not become "ga"
    expect(tokens('gas').has('gas')).toBe(true)
    expect(tokens('bus').has('bus')).toBe(true)
  })
})

describe('working out what an ask is about', () => {
  it('takes the words out of an action input and leaves the machinery', () => {
    const t = topicOf({
      subject: { id: 'th-9', title: 'Draft the buyer note', summary: 'for SS27', due: '2026-08-01' },
      alongside: ['Book the studio'],
      known: [],
    })
    expect(t).toContain('Draft the buyer note')
    expect(t).toContain('Book the studio')
    // an id or a date is not a topic, and matching on one is worse than nothing
    expect(t).not.toContain('th-9')
    expect(t).not.toContain('2026-08-01')
  })

  it('never carries a base64 image into the ranker', () => {
    const t = topicOf({ subject: { title: 'What fabric is this?' }, image: { mediaType: 'image/jpeg', dataB64: 'AAAAAAAA' } })
    expect(t).toContain('What fabric')
    expect(t).not.toContain('AAAA')
  })

  it('survives anything it is handed', () => {
    for (const bad of [null, undefined, 42, '', [], {}]) {
      expect(() => topicOf(bad)).not.toThrow()
    }
    expect(topicOf(null)).toBe('')
  })

  it('does not run away down a deep object', () => {
    let deep: unknown = 'bottom'
    for (let i = 0; i < 30; i++) deep = { next: deep }
    expect(() => topicOf(deep)).not.toThrow()
  })
})

describe('which kinds shape everything, and which have to be about the ask', () => {
  it('draws the line where the ranker draws it', () => {
    /*
     * The Memory page used to show eight equal buckets in a row, so a
     * constraint that governs every piece of work the app does looked exactly
     * like a fact about one supplier. One rule now draws the line in both
     * places rather than the page guessing at it.
     */
    for (const k of ['constraint', 'preference', 'pattern']) expect(ridesAlong(k)).toBe(true)
    for (const k of ['goal', 'tool', 'person', 'fact']) expect(ridesAlong(k)).toBe(false)
  })

  it('does not promote something it has never formed a view on', () => {
    // an unclassified memory is not one the app decided is unimportant — but
    // it is not one it decided governs everything either
    expect(ridesAlong(null)).toBe(false)
    expect(ridesAlong('')).toBe(false)
    expect(ridesAlong('something invented')).toBe(false)
  })
})
