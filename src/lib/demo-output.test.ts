// The demo is the only place the whole app runs end to end, and nothing was
// checking that what it says is still true.
//
// `runAction` returns `DEMO_OUTPUT[action] as O` — a cast, never a parse — and
// `DEMO_OUTPUT` is typed `Record<string, unknown>`. So a canned answer is free
// to drift away from the schema it is pretending to be, and nothing anywhere
// notices: not the compiler, which was handed a cast, and not the app, which
// reads whichever fields happen to be there and quietly does without the rest.
//
// It had already happened. `rain` gained a `canDraft` on every step — the field
// that decides whether the app offers to do a step for you — and the canned
// rain was not updated, so the demo went on showing a version of the app from
// before the feature, and the full test suite passed.
import { describe, expect, it } from 'vitest'
import { ACTION_REGISTRY } from '@shared/ai/registry'
import { DEMO_OUTPUT } from './demo'

describe('what the demo says the engine returns', () => {
  const keys = Object.keys(DEMO_OUTPUT)

  it('is canned for something the app can actually run', () => {
    // a key with no action behind it is an answer to a question nobody asks
    for (const k of keys) expect(ACTION_REGISTRY[k], k).toBeDefined()
  })

  it.each(keys)('“%s” still matches the schema it is pretending to be', (k) => {
    const parsed = ACTION_REGISTRY[k].outputSchema.safeParse(DEMO_OUTPUT[k])
    // the failure message is the whole point of this test — say which field
    expect(parsed.success ? null : JSON.stringify(parsed.error.issues, null, 1)).toBeNull()
  })
})
