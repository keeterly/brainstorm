import { describe, expect, it } from 'vitest'
import { KIN_EVIDENCE, KIN_POOL, KIN_THREAD, kinship, stem, terms } from './kinship'

describe('reading a thought into words', () => {
  it('drops the words that carry nothing', () => {
    expect(terms('What if the campaign used handwritten letters?')).toEqual(['campaign', 'handwritten', 'letter'])
  })
  it('folds a plural onto its singular, so they can match', () => {
    expect(stem('collections')).toBe('collection')
    expect(stem('invitations')).toBe('invit')
    expect(stem('readiness')).toBe('ready')
    expect(terms('Buyer invitations')).toEqual(terms('Buyer invitation'))
  })
  it('does not maul short words into nonsense', () => {
    for (const w of ['less', 'miss', 'this', 'gas', 'us', 'is', 'sales']) {
      expect(stem(w).length, w).toBeGreaterThanOrEqual(Math.min(3, w.length))
    }
    expect(stem('press')).toBe('press')
  })
})

// The sky the user actually reported this against: two big real groups, and a
// scatter of loose thoughts that have nothing to do with either.
const SKY = [
  { id: 'lookbook', title: 'SS27 Lookbook & Collection Prep', inside: [
    'Add or update missing style codes', 'Shoot on expired film', 'Lookbook on newsprint',
    'Book the photographer', 'Letters sealed with wax', 'Pick the paper stock',
  ] },
  { id: 'funding', title: 'VENIA funding readiness', inside: [
    'Get approved for a $100K SBA loan', 'Draft executive summary and use of funds',
    'File LLC for VENIA', 'Audit the 15 active styles', 'Ask Mei about the SBA packet',
    'Where does the money actually go', 'Cost out a 40-unit cut', 'Open a business account',
  ] },
  { id: 'cave', title: 'SS28 The Cave' },
  { id: 'shadow', title: 'We are the shadows we leave behind' },
  { id: 'room', title: 'A pop-up that feels like a listening room' },
  { id: 'labels', title: 'Order care labels' },
  { id: 'sba', title: 'Get Approved for $100K SBA Loan (30-45 Days)' },
  { id: 'summary', title: 'Draft executive summary cover letter' },
  { id: 'film', title: 'Expired film, natural light only' },
  { id: 'design', title: 'Build a personal Design System with Claude Design' },
]

describe('what gather decides to pull in', () => {
  const k = kinship(SKY)
  const pools = (id: string) =>
    k.nearest(id).filter((n) => k.belongs(id, n.id) >= KIN_POOL && k.evidence(id, n.id) >= KIN_EVIDENCE)

  it('pools a thought with the group it is genuinely about', () => {
    expect(pools('sba').map((p) => p.id)).toEqual(['funding'])
    expect(pools('summary').map((p) => p.id)).toEqual(['funding'])
    expect(pools('film').map((p) => p.id)).toEqual(['lookbook'])
  })

  it('does not pull a big group in just for being big', () => {
    // the reported bug: a pool stood for every word inside it, so it looked
    // like kin of nearly everything in the sky. Being large is now no
    // advantage, because the size that flattered it is not in the denominator.
    for (const loose of ['cave', 'shadow', 'room', 'labels', 'design']) {
      expect(pools(loose), loose).toEqual([])
    }
  })

  it('keeps two unrelated thoughts apart even when they share a common word', () => {
    // both mention VENIA; that is the least informative word in this sky
    expect(k.score('design', 'funding')).toBeLessThan(KIN_THREAD)
  })

  it('does not merge the two big groups into each other', () => {
    expect(k.belongs('funding', 'lookbook')).toBeLessThan(KIN_POOL)
    expect(k.belongs('lookbook', 'funding')).toBeLessThan(KIN_POOL)
  })

  it('still draws a thread where there is a real relation, and only there', () => {
    const threads = new Set<string>()
    for (const a of k.ids) for (const b of k.ids) {
      if (a < b && k.score(a, b) >= KIN_THREAD) threads.add(`${a}~${b}`)
    }
    expect(threads).toContain('funding~sba')
    expect(threads).toContain('funding~summary')
    expect(threads).toContain('film~lookbook')
    expect([...threads].some((t) => t.includes('shadow') || t.includes('room') || t.includes('cave'))).toBe(false)
  })

  it('will not swallow a two-word thought on one lucky word', () => {
    const sky = kinship([
      ...SKY,
      // shares "film" with the lookbook group and nothing else at all
      { id: 'terse', title: 'film society' },
    ])
    // containment alone would say yes; the evidence gate is what says no
    expect(sky.belongs('terse', 'lookbook')).toBeGreaterThan(0)
    expect(sky.evidence('terse', 'lookbook')).toBeLessThan(KIN_EVIDENCE)
  })

  it('names what two things have in common, rarest word first', () => {
    expect(k.common('sba', 'funding')[0]).toBe('sba')
    expect(k.common('film', 'lookbook')).toContain('film')
  })
})

describe('scoring that cannot be gamed by size', () => {
  it('a long title does not out-score a short one just for being long', () => {
    const k = kinship([
      { id: 'short', title: 'expired film' },
      { id: 'long', title: 'expired film and a great many other entirely unrelated matters concerning paperwork, insurance, freight, tax' },
      { id: 'target', title: 'shoot on expired film' },
    ])
    expect(k.score('short', 'target')).toBeGreaterThan(k.score('long', 'target'))
  })

  it('a word in every thought counts for nothing', () => {
    const k = kinship([
      { id: 'a', title: 'venia sample' },
      { id: 'b', title: 'venia freight' },
      { id: 'c', title: 'venia tax' },
      { id: 'd', title: 'venia press' },
    ])
    // they all share "venia" and nothing else, so none of them are kin
    for (const [x, y] of [['a', 'b'], ['b', 'c'], ['c', 'd'], ['a', 'd']]) {
      expect(k.score(x, y), `${x}/${y}`).toBeLessThan(KIN_THREAD)
    }
  })

  it('two distinct rare words beat the same word said five times', () => {
    const k = kinship([
      { id: 'shouty', title: 'film', inside: ['film', 'film', 'film', 'film'] },
      { id: 'apt', title: 'expired newsprint' },
      { id: 'target', title: 'expired film on newsprint' },
      { id: 'noise1', title: 'freight and tax' },
      { id: 'noise2', title: 'insurance paperwork' },
    ])
    expect(k.score('apt', 'target')).toBeGreaterThan(k.score('shouty', 'target'))
  })

  it('asks the belonging question in the direction that makes sense', () => {
    const k = kinship([
      { id: 'group', title: 'SS27 lookbook', inside: ['expired film', 'newsprint', 'photographer', 'wax seals', 'paper stock'] },
      { id: 'member', title: 'expired film' },
      { id: 'far', title: 'quarterly freight invoices' },
    ])
    // the member is wholly accounted for by the group…
    expect(k.belongs('member', 'group')).toBe(1)
    // …but the group is not accounted for by the member, and that asymmetry is
    // the whole point: a group is never "like" any one thing inside it
    expect(k.belongs('group', 'member')).toBeLessThan(0.5)
    expect(k.belongs('far', 'group')).toBe(0)
  })

  it('is symmetric, and a thing is wholly itself', () => {
    const k = kinship(SKY)
    expect(k.score('sba', 'funding')).toBeCloseTo(k.score('funding', 'sba'), 9)
    expect(k.score('sba', 'sba')).toBe(1)
  })

  it('never returns anything outside 0…1, on any pair in a real sky', () => {
    const k = kinship(SKY)
    for (const a of k.ids) for (const b of k.ids) {
      const s = k.score(a, b)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
      expect(Number.isFinite(s)).toBe(true)
    }
  })

  it('survives an empty sky, a lone thought, and a wordless one', () => {
    expect(kinship([]).nearest('nope')).toEqual([])
    const one = kinship([{ id: 'a', title: 'alone' }])
    expect(one.nearest('a')).toEqual([])
    const blank = kinship([{ id: 'a', title: '' }, { id: 'b', title: '???' }])
    expect(blank.score('a', 'b')).toBe(0)
  })
})
