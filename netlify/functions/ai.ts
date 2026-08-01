// POST /api/ai — the AI Action Engine endpoint.
// Runs named, versioned, Zod-validated actions server-side. The Anthropic key
// never leaves this function; callers authenticate with their Supabase JWT and
// every run is logged to agent_runs under their own user id (RLS enforced).
//
// The order things happen in here is the whole of how fast the app feels.
// classify_thought measured between 1.9 and 3.4 seconds for one line of text,
// and the model is under a second of that: the rest was three Supabase round
// trips queued up in front of it — who are you, how many runs today, here is a
// new row — each waiting for the last, before the question was even asked. Two
// of those no longer block: the token check is remembered for a minute, and the
// run row is opened alongside the model call rather than ahead of it. Only the
// spend gate still goes first, because a guard that runs after the money is
// spent is not a guard.
import { z } from 'zod'
import { ACTION_REGISTRY } from '../../shared/ai/registry'
import { MODEL_FOR_TIER } from '../../shared/ai/pricing'
import type { PromptCtx } from '../../shared/ai/types'
import { corsHeaders, originAllowed } from './_lib/guard'
import { verifyUser } from './_lib/auth'
import { recordFailure, recordOutcome, runToValidated, type RunRequest } from './_lib/engine'
import { allowRun, insertRun } from './_lib/runs'

const BodySchema = z.object({
  action: z.string(),
  input: z.unknown(),
  /** How much looking-up this run needs, when the caller has already worked
   *  that out. Clamped below to the action's own ceiling: a request can only
   *  ever ask for less than the action allows, never more. */
  searches: z.number().int().min(0).max(10).optional(),
  ctx: z
    .object({
      tzOffsetMin: z.number().int().min(-840).max(840).default(0),
      memory: z.array(z.string().max(300)).max(60).default([]),
    })
    .default({ tzOffsetMin: 0, memory: [] }),
})

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

export default async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Method Not Allowed' }, cors)
  if (!originAllowed(req)) return json(403, { error: 'Forbidden' }, cors)

  const startedAt = Date.now()
  const user = await verifyUser(req)
  const auth_ms = Date.now() - startedAt
  if (!user) return json(401, { error: 'Sign in to use AI actions' }, cors)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json(500, { error: 'ANTHROPIC_API_KEY is not configured' }, cors)

  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(await req.json())
  } catch {
    return json(400, { error: 'Bad request body' }, cors)
  }

  const def = ACTION_REGISTRY[body.action]
  if (!def) return json(400, { error: `Unknown action "${body.action}"` }, cors)

  const parsedInput = def.inputSchema.safeParse(body.input)
  if (!parsedInput.success) {
    return json(400, { error: 'Invalid input', details: parsedInput.error.flatten() }, cors)
  }

  // Only ever downward. The action definition is the authority on how much
  // this may cost; the caller is merely allowed to want less of it.
  const searchMaxUses =
    body.searches === undefined ? undefined : Math.min(body.searches, def.searchMaxUses ?? 0)

  const ctx: PromptCtx = {
    nowISO: new Date().toISOString(),
    tzOffsetMin: body.ctx.tzOffsetMin,
    memory: body.ctx.memory,
  }
  const model = MODEL_FOR_TIER[def.modelTier]

  // After the searches are settled, because what this might cost depends on
  // how many of them it is allowed to make — usually by more than the tokens.
  const gateAt = Date.now()
  const gate = await allowRun(
    user.token,
    user.id,
    def,
    model,
    JSON.stringify(parsedInput.data).length,
    searchMaxUses,
  )
  const gate_ms = Date.now() - gateAt
  if (!gate.ok) return json(gate.status, { error: gate.error }, cors)

  // Opened alongside the question, not in front of it. Nothing needs the row to
  // exist until there is an outcome to write into it — except the meter, which
  // is why the estimate goes on at birth and is corrected at death.
  const rowP = insertRun(user.token, {
    user_id: user.id,
    action: def.name,
    action_version: def.version,
    model,
    input: parsedInput.data,
    cost_usd: gate.cost,
  })
  // an unhandled rejection here would take the process down for a row nobody
  // is waiting on; insertRun already swallows, this is the belt
  rowP.catch(() => null)

  const request = (onDelta?: (c: string) => void): RunRequest => ({
    def,
    input: parsedInput.data,
    ctx,
    apiKey,
    userToken: user.token,
    runId: null, // filled in once the row lands
    startedAt,
    onDelta,
    searchMaxUses,
    timings: { auth_ms, gate_ms, ...(searchMaxUses === undefined ? {} : { searches: searchMaxUses }) },
  })

  // ---- streaming path (SSE) ----
  if (def.stream) {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
        ;(async () => {
          const rq = request((chunk) => send({ type: 'delta', chunk }))
          try {
            const out = await runToValidated(rq)
            rq.runId = await rowP
            await recordOutcome(rq, out)
            if (out.parsed.success) send({ type: 'result', runId: rq.runId, output: out.parsed.data })
            else send({ type: 'error', runId: rq.runId, message: 'AI output failed validation — try again' })
          } catch (e) {
            rq.runId = await rowP
            await recordFailure(rq, e)
            send({ type: 'error', runId: rq.runId, message: String((e as Error).message || e) })
          } finally {
            controller.close()
          }
        })()
      },
    })
    return new Response(stream, {
      status: 200,
      headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  // ---- buffered path ----
  const rq = request()
  try {
    const out = await runToValidated(rq)
    rq.runId = await rowP
    await recordOutcome(rq, out)
    if (out.parsed.success) return json(200, { runId: rq.runId, output: out.parsed.data }, cors)
    return json(502, { runId: rq.runId, error: 'AI output failed validation — try again' }, cors)
  } catch (e) {
    rq.runId = await rowP
    await recordFailure(rq, e)
    return json(502, { runId: rq.runId, error: String((e as Error).message || e) }, cors)
  }
}

export const config = { path: '/api/ai' }
