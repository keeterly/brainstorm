// POST /api/ai-bg — the same engine, for actions that cannot finish in time.
//
// Netlify returns 202 here immediately and lets the work continue for minutes.
// Nothing can be handed back to the caller, so the client sends the run id it
// wants and then watches that row in agent_runs — which it can read under its
// own RLS. Deepening one idea with live research measured at 51 seconds, so
// there is no version of it that fits inside a request.
import { z } from 'zod'
import type { PromptCtx } from '../../shared/ai/types'
import { corsHeaders, originAllowed } from './_lib/guard'
import { verifyUser } from './_lib/auth'
import { actionFor, recordFailure, recordOutcome, runToValidated, type RunRequest } from './_lib/engine'
import { insertRun, runsToday } from './_lib/runs'
import { MODEL_FOR_TIER } from '../../shared/ai/pricing'
import { notifyUser } from './_lib/notify'
import { runNote } from './_lib/note'

const DAILY_RUN_CAP = 400

const BodySchema = z.object({
  action: z.string(),
  input: z.unknown(),
  // the client picks the id so it knows what to watch, since a background
  // function has no way to answer
  runId: z.string().uuid(),
  ctx: z
    .object({
      tzOffsetMin: z.number().int().min(-840).max(840).default(0),
      memory: z.array(z.string().max(300)).max(60).default([]),
    })
    .default({ tzOffsetMin: 0, memory: [] }),
})

const json = (status: number, body: unknown, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

export default async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Method Not Allowed' }, cors)
  if (!originAllowed(req)) return json(403, { error: 'Forbidden' }, cors)

  const user = await verifyUser(req)
  if (!user) return json(401, { error: 'Sign in to use AI actions' }, cors)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json(500, { error: 'ANTHROPIC_API_KEY is not configured' }, cors)

  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(await req.json())
  } catch {
    return json(400, { error: 'Bad request body' }, cors)
  }

  const def = actionFor(body.action)
  if (!def) return json(400, { error: `Unknown action "${body.action}"` }, cors)

  const parsedInput = def.inputSchema.safeParse(body.input)
  if (!parsedInput.success) return json(400, { error: 'Invalid input' }, cors)

  if ((await runsToday(user.token, user.id)) >= DAILY_RUN_CAP) {
    return json(429, { error: `Daily AI limit reached (${DAILY_RUN_CAP} runs). Try again tomorrow.` }, cors)
  }

  // the row exists before the work starts, so the client always has something
  // to watch even if the model call dies on its first breath
  const runId = await insertRun(user.token, {
    id: body.runId,
    user_id: user.id,
    action: def.name,
    action_version: def.version,
    model: MODEL_FOR_TIER[def.modelTier],
    input: parsedInput.data,
  })

  const request: RunRequest = {
    def,
    input: parsedInput.data,
    ctx: {
      nowISO: new Date().toISOString(),
      tzOffsetMin: body.ctx.tzOffsetMin,
      memory: body.ctx.memory,
    } satisfies PromptCtx,
    apiKey,
    userToken: user.token,
    runId,
    startedAt: Date.now(),
  }

  try {
    const outcome = await runToValidated(request)
    await recordOutcome(request, outcome)
    // The whole reason this is a background function is that you are not
    // expected to sit and watch it. So when it lands, say so — the work has
    // already been written down either way, and a notification that fails must
    // never turn a finished run into a failed one.
    if (runId && outcome.parsed.success) {
      const note = runNote(def.name, parsedInput.data, outcome.parsed.data, runId)
      if (note) await notifyUser(user.token, note, { runId })
    }
  } catch (e) {
    await recordFailure(request, e)
  }
  return json(202, { runId }, cors)
}

// No custom path: Netlify decides a function is a background one from the
// -background filename, and the default route is the one guaranteed to keep
// that behaviour. A pretty URL is not worth risking a 10-second timeout.
