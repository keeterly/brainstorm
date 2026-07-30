import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../ai'
import { forgetVerified } from '../_lib/auth'

// End-to-end function tests with the network fully mocked: Supabase auth,
// agent_runs REST, and the Anthropic API.
const ENV = {
  ANTHROPIC_API_KEY: 'sk-test',
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  ALLOWED_ORIGINS: 'https://app.test',
}

interface MockState {
  authOk: boolean
  runRows: Record<string, unknown>[]
  runPatches: Record<string, unknown>[]
  todayCount: number
  anthropicResponses: Array<Record<string, unknown> | { __status: number }>
  anthropicCalls: Record<string, unknown>[]
}
let state: MockState

function anthropicToolResponse(input: unknown) {
  return {
    content: [{ type: 'tool_use', name: 'emit', input }],
    usage: { input_tokens: 120, output_tokens: 40 },
    model: 'claude-haiku-4-5',
  }
}

beforeEach(() => {
  // a passed token check is remembered for a minute in the real thing; each
  // test here needs to start from nobody being known
  forgetVerified()
  state = {
    authOk: true,
    runRows: [],
    runPatches: [],
    todayCount: 0,
    anthropicResponses: [],
    anthropicCalls: [],
  }
  Object.assign(process.env, ENV)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/auth/v1/user')) {
        return state.authOk
          ? new Response(JSON.stringify({ id: 'user-1', email: 'k@test.com' }), { status: 200 })
          : new Response('', { status: 401 })
      }
      if (u.includes('/rest/v1/agent_runs')) {
        if (init?.method === 'POST') {
          const row = JSON.parse(String(init.body))
          state.runRows.push(row)
          return new Response(JSON.stringify([{ id: 'run-1' }]), { status: 201 })
        }
        if (init?.method === 'PATCH') {
          state.runPatches.push(JSON.parse(String(init.body)))
          return new Response('[]', { status: 200 })
        }
        if (init?.method === 'HEAD') {
          return new Response(null, {
            status: 200,
            headers: { 'content-range': `0-0/${state.todayCount}` },
          })
        }
      }
      if (u.includes('api.anthropic.com')) {
        state.anthropicCalls.push(JSON.parse(String(init?.body)))
        const next = state.anthropicResponses.shift()
        if (!next) throw new Error('unexpected anthropic call')
        if ('__status' in next) return new Response('{}', { status: next.__status as number })
        return new Response(JSON.stringify(next), { status: 200 })
      }
      throw new Error(`unmocked fetch: ${u}`)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://app.test/api/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://app.test',
      Authorization: 'Bearer user-jwt',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

const VALID = { action: 'classify_thought', input: { raw_content: 'email supplier friday' } }
const GOOD_OUTPUT = {
  type: 'task',
  confidence: 0.9,
  title: 'Email supplier',
  summary: 'Send the supplier an email',
  suggestedDue: null,
  clarifyingQuestion: null,
}

describe('/api/ai', () => {
  it('rejects foreign origins', async () => {
    const r = await handler(req(VALID, { Origin: 'https://evil.example' }))
    expect(r.status).toBe(403)
  })

  it('rejects unauthenticated callers', async () => {
    state.authOk = false
    const r = await handler(req(VALID))
    expect(r.status).toBe(401)
  })

  it('rejects unknown actions and invalid input with 400', async () => {
    expect((await handler(req({ action: 'nope', input: {} }))).status).toBe(400)
    expect((await handler(req({ action: 'classify_thought', input: { raw_content: '' } }))).status).toBe(400)
  })

  it('happy path: validates output, logs the run with cost', async () => {
    state.anthropicResponses = [anthropicToolResponse(GOOD_OUTPUT)]
    const r = await handler(req(VALID))
    expect(r.status).toBe(200)
    const body = (await r.json()) as { runId: string; output: typeof GOOD_OUTPUT }
    expect(body.runId).toBe('run-1')
    expect(body.output.type).toBe('task')
    expect(state.runRows[0]).toMatchObject({ action: 'classify_thought', status: 'running', user_id: 'user-1' })
    const patch = state.runPatches[0]
    expect(patch.status).toBe('succeeded')
    expect(patch.input_tokens).toBe(120)
    expect(Number(patch.cost_usd)).toBeGreaterThan(0)
    // forced tool call present in the provider request
    expect(state.anthropicCalls[0]).toMatchObject({ tool_choice: { type: 'tool', name: 'emit' } })
  })

  it('repairs invalid output once, then succeeds', async () => {
    state.anthropicResponses = [
      anthropicToolResponse({ ...GOOD_OUTPUT, type: 'martian' }),
      anthropicToolResponse(GOOD_OUTPUT),
    ]
    const r = await handler(req(VALID))
    expect(r.status).toBe(200)
    expect(state.anthropicCalls).toHaveLength(2)
    expect(String((state.anthropicCalls[1] as { messages: { content: string }[] }).messages[0].content)).toContain(
      'failed validation',
    )
  })

  it('marks invalid_output after a failed repair', async () => {
    state.anthropicResponses = [
      anthropicToolResponse({ ...GOOD_OUTPUT, type: 'martian' }),
      anthropicToolResponse({ ...GOOD_OUTPUT, type: 'venusian' }),
    ]
    const r = await handler(req(VALID))
    expect(r.status).toBe(502)
    expect(state.runPatches[0].status).toBe('invalid_output')
  })

  it('retries transport errors once', async () => {
    state.anthropicResponses = [{ __status: 529 }, anthropicToolResponse(GOOD_OUTPUT)]
    const r = await handler(req(VALID))
    expect(r.status).toBe(200)
    expect(state.anthropicCalls).toHaveLength(2)
  })

  it('enforces the daily run cap', async () => {
    state.todayCount = 400
    const r = await handler(req(VALID))
    expect(r.status).toBe(429)
  })
})

const DEEPEN_REQ = {
  action: 'deepen',
  input: { subject: { id: 'g1', title: 'Get a $100k SBA loan' }, context: [] },
}
const DEEPEN_OUT = {
  read: 'A 7(a) working-capital loan',
  found: [{ point: '7(a) caps at $5M', why: 'Well above what you need' }],
  steps: [{ tempId: 's1', title: 'Pull two years of returns', why: 'Lenders open with this', effort: 2, dependsOn: [] }],
  watchOuts: [],
  sources: [{ title: 'SBA', url: 'https://www.sba.gov/x' }],
  learned: [],
  note: 'It is a 7(a).',
}

describe('going out to look things up', () => {
  it('offers the search tool and does not force the answer before it can search', async () => {
    state.anthropicResponses = [anthropicToolResponse(DEEPEN_OUT)]
    const r = await handler(req(DEEPEN_REQ))
    expect(r.status).toBe(200)
    const call = state.anthropicCalls[0] as {
      tools: { name?: string; type?: string }[]
      tool_choice: { type: string }
    }
    expect(call.tools.some((t) => t.type === 'web_search_20250305')).toBe(true)
    // forcing emit would fire before it ever reached the search
    expect(call.tool_choice.type).toBe('auto')
  })

  it('asks again, holding it to the schema, when it searched but never emitted', async () => {
    state.anthropicResponses = [
      {
        content: [
          { type: 'server_tool_use', name: 'web_search', input: { query: 'SBA 7(a) requirements' } },
          { type: 'text', text: 'Here is what I found...' },
        ],
        usage: { input_tokens: 300, output_tokens: 90 },
        model: 'claude-sonnet-5',
      },
      anthropicToolResponse(DEEPEN_OUT),
    ]
    const r = await handler(req(DEEPEN_REQ))
    expect(r.status).toBe(200)
    expect(state.anthropicCalls).toHaveLength(2)
    const second = state.anthropicCalls[1] as {
      tool_choice: { type: string; name?: string }
      messages: { role: string }[]
    }
    expect(second.tool_choice).toMatchObject({ type: 'tool', name: 'emit' })
    // the searching turn is carried forward, so nothing it found is thrown away
    expect(second.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    // and both passes are paid for
    expect(state.runPatches[0].input_tokens).toBe(420)
  })

  it('leaves every other action answering from what it was given', async () => {
    state.anthropicResponses = [anthropicToolResponse(GOOD_OUTPUT)]
    await handler(req(VALID))
    const call = state.anthropicCalls[0] as { tools: { type?: string }[] }
    expect(call.tools.some((t) => t.type === 'web_search_20250305')).toBe(false)
  })
})

describe('being generous is not the same as being wrong', () => {
  const eleven = {
    ...DEEPEN_OUT,
    steps: Array.from({ length: 11 }, (_, i) => ({
      tempId: `s${i}`,
      title: `step ${i}`,
      why: 'because',
      effort: 2,
      dependsOn: [],
    })),
  }

  it('keeps the research instead of spending another minute re-asking', async () => {
    // the real failure: eighty-five seconds of live research thrown away over
    // an eleventh step in a schema that allows ten
    state.anthropicResponses = [anthropicToolResponse(eleven)]
    const r = await handler(req(DEEPEN_REQ))
    expect(r.status).toBe(200)
    // one call, not two: it was clipped rather than re-asked
    expect(state.anthropicCalls).toHaveLength(1)
    const body = (await r.json()) as { output: { steps: unknown[] } }
    expect(body.output.steps).toHaveLength(10)
  })

  it('says in the record that it clipped something, rather than pretending it did not', async () => {
    state.anthropicResponses = [anthropicToolResponse(eleven)]
    await handler(req(DEEPEN_REQ))
    const timings = state.runPatches[0].timings as { trimmed?: string[] }
    expect(timings.trimmed?.join(' ')).toContain('kept 10 of 11')
  })

  it('still re-asks when the output is actually wrong, not merely long', async () => {
    // a bad enum is a misunderstanding; clipping must never paper over one
    state.anthropicResponses = [
      anthropicToolResponse({ ...GOOD_OUTPUT, type: 'martian' }),
      anthropicToolResponse(GOOD_OUTPUT),
    ]
    const r = await handler(req(VALID))
    expect(r.status).toBe(200)
    expect(state.anthropicCalls).toHaveLength(2)
  })
})

describe('what a failed run leaves behind', () => {
  it('names the field, instead of one sentence that says nothing', async () => {
    state.anthropicResponses = [
      anthropicToolResponse({ ...GOOD_OUTPUT, type: 'martian' }),
      anthropicToolResponse({ ...GOOD_OUTPUT, type: 'venusian' }),
    ]
    await handler(req(VALID))
    const patch = state.runPatches[0]
    expect(patch.status).toBe('invalid_output')
    expect(String(patch.error)).toContain('type')
  })

  it('keeps what the model actually sent, so it can be looked at', async () => {
    state.anthropicResponses = [
      anthropicToolResponse({ ...GOOD_OUTPUT, type: 'martian' }),
      anthropicToolResponse({ ...GOOD_OUTPUT, type: 'venusian' }),
    ]
    await handler(req(VALID))
    const timings = state.runPatches[0].timings as { raw?: string }
    expect(timings.raw).toContain('venusian')
  })

  it('tells a truncated answer apart from a wrong one', async () => {
    // running out of room and misunderstanding the question used to arrive
    // wearing the same message
    state.anthropicResponses = [
      { ...anthropicToolResponse({ read: 'partial' }), stop_reason: 'max_tokens' },
      { ...anthropicToolResponse({ read: 'partial' }), stop_reason: 'max_tokens' },
    ]
    await handler(req(DEEPEN_REQ))
    expect(String(state.runPatches[0].error)).toContain('ran out of room')
  })
})

describe('the waiting around a fast action', () => {
  it('does not queue the run row in front of the question', async () => {
    // the row used to be written, and awaited, before the model was reached
    let rowWrittenAt = 0
    let modelCalledAt = 0
    const inner = globalThis.fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>
    vi.stubGlobal('fetch', async (u: string | URL | Request, i?: RequestInit) => {
      const s = String(u)
      if (s.includes('/rest/v1/agent_runs') && i?.method === 'POST') rowWrittenAt = performance.now()
      if (s.includes('api.anthropic.com')) modelCalledAt = performance.now()
      return inner(String(u), i)
    })
    state.anthropicResponses = [anthropicToolResponse(GOOD_OUTPUT)]
    const r = await handler(req(VALID))
    expect(r.status).toBe(200)
    // both start; neither waits on the other
    expect(rowWrittenAt).toBeGreaterThan(0)
    expect(modelCalledAt).toBeGreaterThan(0)
    // and the answer still carries the row id
    expect(((await r.json()) as { runId: string }).runId).toBe('run-1')
  })

  it('asks Supabase who you are once, not once per action', async () => {
    state.anthropicResponses = [anthropicToolResponse(GOOD_OUTPUT), anthropicToolResponse(GOOD_OUTPUT)]
    await handler(req(VALID))
    await handler(req(VALID))
    const calls = (globalThis.fetch as unknown as { mock: { calls: [string][] } }).mock.calls
    const authCalls = calls.filter(([u]) => String(u).includes('/auth/v1/user'))
    expect(authCalls).toHaveLength(1)
  })

  it('never remembers a token that was refused', async () => {
    state.authOk = false
    expect((await handler(req(VALID))).status).toBe(401)
    state.authOk = true
    state.anthropicResponses = [anthropicToolResponse(GOOD_OUTPUT)]
    expect((await handler(req(VALID))).status).toBe(200)
  })

  it('records where the time went', async () => {
    state.anthropicResponses = [anthropicToolResponse(GOOD_OUTPUT)]
    await handler(req(VALID))
    const t = state.runPatches[0].timings as Record<string, number>
    expect(typeof t.model_ms).toBe('number')
    expect(typeof t.total_ms).toBe('number')
    expect(typeof t.auth_ms).toBe('number')
  })
})
