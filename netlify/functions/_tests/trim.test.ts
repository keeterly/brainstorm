import { describe, expect, it } from 'vitest'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { ACTION_REGISTRY } from '../../../shared/ai/registry'
import { trimToSchema } from '../_lib/trim'

const schemaOf = (action: string) =>
  zodToJsonSchema(ACTION_REGISTRY[action].outputSchema, { $refStrategy: 'none' })

/** A deepen result that is right in every way except that it is generous. */
function overSupplied(steps: number, found: number) {
  return {
    read: 'Booking LAX→CDG for Paris Fashion Week, with an Italy leg after',
    found: Array.from({ length: found }, (_, i) => ({ point: `found ${i}`, why: 'it matters' })),
    steps: Array.from({ length: steps }, (_, i) => ({
      tempId: `s${i}`,
      title: `step ${i}`,
      why: 'because',
      effort: 2,
      dependsOn: [],
    })),
    watchOuts: ['a', 'b'],
    sources: [{ title: 'Air France', url: 'https://a.test' }],
    learned: ['Flies to Paris for fashion week'],
    note: 'Here is the order.',
  }
}

describe('the eleventh step', () => {
  const deepen = ACTION_REGISTRY.deepen

  it('is what actually failed: a good result, one item too long', () => {
    // eleven steps where ten are allowed. Nothing about this is wrong except
    // the count, and it cost eighty-five seconds twice.
    expect(deepen.outputSchema.safeParse(overSupplied(11, 3)).success).toBe(false)
  })

  it('validates once the excess is clipped', () => {
    const { value, trimmed } = trimToSchema(schemaOf('deepen'), overSupplied(11, 3))
    expect(trimmed).toBe(true)
    const parsed = deepen.outputSchema.safeParse(value)
    expect(parsed.success).toBe(true)
    expect((parsed as { data: { steps: unknown[] } }).data.steps).toHaveLength(10)
  })

  it('keeps the first of them, which is the one you are meant to do next', () => {
    const { value } = trimToSchema(schemaOf('deepen'), overSupplied(14, 3))
    const steps = (value as { steps: { title: string }[] }).steps
    expect(steps[0].title).toBe('step 0')
    expect(steps).toHaveLength(10)
  })

  it('clips every over-long array in one pass, not just the first', () => {
    const { value } = trimToSchema(schemaOf('deepen'), overSupplied(12, 11))
    const v = value as { steps: unknown[]; found: unknown[] }
    expect(v.steps).toHaveLength(10)
    expect(v.found).toHaveLength(8)
  })

  it('says what it cut, so the record is not silent about it', () => {
    const { notes } = trimToSchema(schemaOf('deepen'), overSupplied(12, 3))
    expect(notes.join(' ')).toContain('steps')
    expect(notes.join(' ')).toContain('kept 10 of 12')
  })

  it('leaves a result that already fits completely alone', () => {
    const good = overSupplied(3, 2)
    const { value, trimmed, notes } = trimToSchema(schemaOf('deepen'), good)
    expect(trimmed).toBe(false)
    expect(notes).toEqual([])
    expect(value).toEqual(good)
  })
})

describe('a sentence that ran long', () => {
  it('is shortened to fit, on a word boundary where there is one near the end', () => {
    const long = 'x '.repeat(200) + 'and then some more words here'
    const { value } = trimToSchema(schemaOf('deepen'), { ...overSupplied(2, 1), note: long })
    const note = (value as { note: string }).note
    expect(note.length).toBeLessThanOrEqual(240)
    expect(note.endsWith(' ')).toBe(false)
  })

  it('reaches strings nested inside arrays of objects', () => {
    const o = overSupplied(2, 1)
    o.steps[0].title = 'T'.repeat(400)
    const { value } = trimToSchema(schemaOf('deepen'), o)
    expect((value as { steps: { title: string }[] }).steps[0].title.length).toBeLessThanOrEqual(160)
  })
})

describe('what it refuses to invent', () => {
  it('does not fill in a field the model never sent', () => {
    const { value } = trimToSchema(schemaOf('deepen'), { read: 'x' })
    expect(value).toEqual({ read: 'x' })
    expect(ACTION_REGISTRY.deepen.outputSchema.safeParse(value).success).toBe(false)
  })

  it('does not clamp a number into range — that would change the answer', () => {
    const o = overSupplied(2, 1)
    o.steps[0].effort = 47
    const { value } = trimToSchema(schemaOf('deepen'), o)
    expect((value as { steps: { effort: number }[] }).steps[0].effort).toBe(47)
    expect(ACTION_REGISTRY.deepen.outputSchema.safeParse(value).success).toBe(false)
  })

  it('does not touch a value of an unexpected type', () => {
    const { value } = trimToSchema(schemaOf('deepen'), { ...overSupplied(2, 1), steps: 'nope' })
    expect((value as { steps: unknown }).steps).toBe('nope')
  })

  it('survives anything at all being handed to it', () => {
    for (const bad of [null, undefined, 42, 'a string', [], {}]) {
      expect(() => trimToSchema(schemaOf('deepen'), bad)).not.toThrow()
    }
  })
})

describe('across every action, not just the one that broke', () => {
  it('never turns a valid result into an invalid one', () => {
    // trimming is only ever allowed to help
    const samples: Record<string, unknown> = {
      answer: {
        asked: 'What does it cost?',
        answer: '$1,214.',
        facts: [{ label: 'Fare', value: '$1,214' }],
        asOf: 'today',
        unknown: [],
        next: [],
        sources: [],
        learned: [],
        settled: true,
      },
      deepen: overSupplied(3, 2),
    }
    for (const [action, good] of Object.entries(samples)) {
      const def = ACTION_REGISTRY[action]
      expect(def.outputSchema.safeParse(good).success, action).toBe(true)
      const { value } = trimToSchema(schemaOf(action), good)
      expect(def.outputSchema.safeParse(value).success, action).toBe(true)
    }
  })

  it('rescues an over-long answer the same way it rescues a brief', () => {
    const over = {
      asked: 'What does it cost?',
      answer: '$1,214.',
      facts: Array.from({ length: 12 }, (_, i) => ({ label: `l${i}`, value: `v${i}` })),
      asOf: 'today',
      unknown: [],
      next: [],
      sources: [],
      learned: [],
      settled: true,
    }
    expect(ACTION_REGISTRY.answer.outputSchema.safeParse(over).success).toBe(false)
    const { value } = trimToSchema(schemaOf('answer'), over)
    expect(ACTION_REGISTRY.answer.outputSchema.safeParse(value).success).toBe(true)
  })
})
