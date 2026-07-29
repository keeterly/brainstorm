// POST /api/ai — the AI Action Engine endpoint.
// Runs named, versioned, Zod-validated actions server-side. The Anthropic key
// never leaves this function; callers authenticate with their Supabase JWT and
// every run is logged to agent_runs under their own user id (RLS enforced).
import { z } from 'zod'
import { ACTION_REGISTRY } from '../../shared/ai/registry'
import { costUSD, MODEL_FOR_TIER } from '../../shared/ai/pricing'
import type { PromptCtx } from '../../shared/ai/types'
import { corsHeaders, originAllowed } from './_lib/guard'
import { verifyUser } from './_lib/auth'
import { AnthropicProvider } from './_lib/provider'
import { insertRun, finishRun, runsToday } from './_lib/runs'

const DAILY_RUN_CAP = 400

const BodySchema = z.object({
  action: z.string(),
  input: z.unknown(),
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

  const def = ACTION_REGISTRY[body.action]
  if (!def) return json(400, { error: `Unknown action "${body.action}"` }, cors)

  const parsedInput = def.inputSchema.safeParse(body.input)
  if (!parsedInput.success) {
    return json(400, { error: 'Invalid input', details: parsedInput.error.flatten() }, cors)
  }

  const used = await runsToday(user.token, user.id)
  if (used >= DAILY_RUN_CAP) {
    return json(429, { error: `Daily AI limit reached (${DAILY_RUN_CAP} runs). Try again tomorrow.` }, cors)
  }

  const ctx: PromptCtx = {
    nowISO: new Date().toISOString(),
    tzOffsetMin: body.ctx.tzOffsetMin,
    memory: body.ctx.memory,
  }
  const model = MODEL_FOR_TIER[def.modelTier]
  const prompt = def.buildPrompt(parsedInput.data, ctx)
  const provider = new AnthropicProvider(apiKey)
  const startedAt = Date.now()

  const runId = await insertRun(user.token, {
    user_id: user.id,
    action: def.name,
    action_version: def.version,
    model,
    input: parsedInput.data,
  })

  // One transport retry on 429/5xx, then one schema-repair retry.
  const attempt = async (extraUser: string, onDelta?: (c: string) => void) => {
    try {
      return await provider.completeStructured({
        model,
        maxTokens: def.maxTokens,
        system: prompt.system,
        user: prompt.user + extraUser,
        images: prompt.images,
        outputSchema: def.outputSchema,
        stream: def.stream,
        onDelta,
        searchMaxUses: def.searchMaxUses,
      })
    } catch (e) {
      const status = (e as { status?: number }).status
      if (status === 429 || (status && status >= 500)) {
        await new Promise((res) => setTimeout(res, 1500))
        return provider.completeStructured({
          model,
          maxTokens: def.maxTokens,
          system: prompt.system,
          user: prompt.user + extraUser,
          outputSchema: def.outputSchema,
          stream: def.stream,
          onDelta,
          searchMaxUses: def.searchMaxUses,
        })
      }
      throw e
    }
  }

  const runToValidated = async (onDelta?: (c: string) => void) => {
    let result = await attempt('', onDelta)
    let parsed = def.outputSchema.safeParse(result.json)
    let totalIn = result.usage.inputTokens
    let totalOut = result.usage.outputTokens
    if (!parsed.success) {
      // Repair retry: show the model its own output and the validation errors.
      const repair =
        `\n\nYour previous attempt produced output that failed validation.\n` +
        `Previous output: ${JSON.stringify(result.json).slice(0, 4000)}\n` +
        `Validation errors: ${JSON.stringify(parsed.error.flatten()).slice(0, 2000)}\n` +
        `Call emit again with corrected output.`
      result = await attempt(repair, onDelta)
      totalIn += result.usage.inputTokens
      totalOut += result.usage.outputTokens
      parsed = def.outputSchema.safeParse(result.json)
    }
    return { parsed, totalIn, totalOut, model: result.model }
  }

  const finalize = async (
    parsed: z.SafeParseReturnType<unknown, unknown>,
    totalIn: number,
    totalOut: number,
  ) => {
    const latency = Date.now() - startedAt
    if (runId) {
      await finishRun(user.token, runId, {
        status: parsed.success ? 'succeeded' : 'invalid_output',
        output: parsed.success ? parsed.data : undefined,
        error: parsed.success ? undefined : 'Output failed schema validation after repair retry',
        input_tokens: totalIn,
        output_tokens: totalOut,
        cost_usd: costUSD(model, totalIn, totalOut),
        latency_ms: latency,
      })
    }
  }

  // ---- streaming path (SSE) ----
  if (def.stream) {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
        ;(async () => {
          try {
            const { parsed, totalIn, totalOut } = await runToValidated((chunk) =>
              send({ type: 'delta', chunk }),
            )
            await finalize(parsed, totalIn, totalOut)
            if (parsed.success) send({ type: 'result', runId, output: parsed.data })
            else send({ type: 'error', runId, message: 'AI output failed validation — try again' })
          } catch (e) {
            if (runId) {
              await finishRun(user.token, runId, {
                status: 'failed',
                error: String((e as Error).message || e),
                latency_ms: Date.now() - startedAt,
              })
            }
            send({ type: 'error', runId, message: String((e as Error).message || e) })
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
  try {
    const { parsed, totalIn, totalOut } = await runToValidated()
    await finalize(parsed, totalIn, totalOut)
    if (parsed.success) return json(200, { runId, output: parsed.data }, cors)
    return json(502, { runId, error: 'AI output failed validation — try again' }, cors)
  } catch (e) {
    if (runId) {
      await finishRun(user.token, runId, {
        status: 'failed',
        error: String((e as Error).message || e),
        latency_ms: Date.now() - startedAt,
      })
    }
    return json(502, { runId, error: String((e as Error).message || e) }, cors)
  }
}

export const config = { path: '/api/ai' }
