import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './ai'

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
