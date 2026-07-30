// The part of /api/ai that actually runs an action, shared by the synchronous
// endpoint and the background one.
//
// Some actions cannot finish inside a request. Deepening one idea with real
// research measured at fifty-one seconds against the live model — far past what
// a synchronous function is allowed — so those runs happen in a background
// function and the answer is collected from agent_runs afterwards. Both paths
// have to log identically, or the row the client is waiting on never arrives.
import type { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { ACTION_REGISTRY } from '../../../shared/ai/registry'
import { costUSD, MODEL_FOR_TIER } from '../../../shared/ai/pricing'
import type { ActionDef, PromptCtx } from '../../../shared/ai/types'
import { AnthropicProvider } from './provider'
import { trimToSchema } from './trim'
import { finishRun } from './runs'

export interface RunRequest {
  def: ActionDef<unknown, unknown>
  input: unknown
  ctx: PromptCtx
  apiKey: string
  userToken: string
  runId: string | null
  startedAt: number
  onDelta?: (chunk: string) => void
  /** How much looking-up this particular run gets, when the caller has already
   *  worked out that this one needs less than the action's ceiling. Already
   *  clamped to that ceiling by the endpoint. */
  searchMaxUses?: number
  /** Anything the caller measured before the model was reached. */
  timings?: Record<string, number>
}

export interface RunOutcome {
  parsed: z.SafeParseReturnType<unknown, unknown>
  totalIn: number
  totalOut: number
  model: string
  /** Why the model stopped, on the attempt that produced `parsed`. */
  stopReason?: string
  /** What was clipped to make it fit, if anything. */
  trimmed?: string[]
  /** How long each phase took, so "it feels slow" can be a number. */
  timings: Record<string, number>
  /** Kept only when it failed: what came back, and what Zod said about it. */
  raw?: unknown
}

export function actionFor(name: string): ActionDef<unknown, unknown> | undefined {
  return ACTION_REGISTRY[name]
}

export async function runToValidated(req: RunRequest): Promise<RunOutcome> {
  const { def, input, ctx, apiKey, onDelta } = req
  const model = MODEL_FOR_TIER[def.modelTier]
  const prompt = def.buildPrompt(input, ctx)
  const provider = new AnthropicProvider(apiKey)
  const timings: Record<string, number> = { ...req.timings }
  // built once: it is the tool's own description of what it may return, which
  // makes it the right authority on what counts as over-supply
  const jsonSchema = zodToJsonSchema(def.outputSchema, { $refStrategy: 'none' })

  // One transport retry on 429/5xx, then one schema-repair retry.
  const attempt = async (extraUser: string) => {
    const call = (withImages: boolean) =>
      provider.completeStructured({
        model,
        maxTokens: def.maxTokens,
        system: prompt.system,
        user: prompt.user + extraUser,
        images: withImages ? prompt.images : undefined,
        outputSchema: def.outputSchema,
        stream: def.stream,
        onDelta,
        searchMaxUses: req.searchMaxUses ?? def.searchMaxUses,
      })
    try {
      return await call(true)
    } catch (e) {
      const status = (e as { status?: number }).status
      if (status === 429 || (status && status >= 500)) {
        await new Promise((res) => setTimeout(res, 1500))
        return call(false)
      }
      throw e
    }
  }

  /**
   * Validate, and if it only failed for being generous, clip it and try again.
   *
   * This is the difference between eighty-five seconds wasted and forty-two
   * seconds well spent. An eleventh step in a schema that allows ten is not a
   * misunderstanding — the answer is correct and one item too long — and asking
   * the model to do the whole minute again usually produces eleven steps a
   * second time.
   */
  const validate = (raw: unknown) => {
    const first = def.outputSchema.safeParse(raw)
    if (first.success) return { parsed: first, trimmed: undefined as string[] | undefined }
    const cut = trimToSchema(jsonSchema, raw)
    if (!cut.trimmed) return { parsed: first, trimmed: undefined }
    const second = def.outputSchema.safeParse(cut.value)
    return second.success ? { parsed: second, trimmed: cut.notes } : { parsed: first, trimmed: undefined }
  }

  const t0 = Date.now()
  let result = await attempt('')
  timings.model_ms = Date.now() - t0
  let { parsed, trimmed } = validate(result.json)
  let totalIn = result.usage.inputTokens
  let totalOut = result.usage.outputTokens

  if (!parsed.success) {
    // Repair retry: show the model its own output and the validation errors.
    const repair =
      `\n\nYour previous attempt produced output that failed validation.\n` +
      `Previous output: ${JSON.stringify(result.json).slice(0, 4000)}\n` +
      `Validation errors: ${JSON.stringify(parsed.error.flatten()).slice(0, 2000)}\n` +
      `Call emit again with corrected output.`
    const t1 = Date.now()
    result = await attempt(repair)
    timings.repair_ms = Date.now() - t1
    totalIn += result.usage.inputTokens
    totalOut += result.usage.outputTokens
    ;({ parsed, trimmed } = validate(result.json))
  }

  return {
    parsed,
    totalIn,
    totalOut,
    model: result.model,
    stopReason: result.stopReason,
    trimmed,
    timings,
    raw: parsed.success ? undefined : result.json,
  }
}

/**
 * Why it failed, in enough detail to fix it.
 *
 * "Output failed schema validation after repair retry" is what two eighty-five
 * second failures left behind, and it says nothing: not which field, not what
 * the model actually sent, not whether it was cut off mid-sentence. The row is
 * the only witness to a run that happened on a server while the phone was
 * locked, so it now carries the field, the reason, and the evidence.
 */
export function failureReason(out: RunOutcome): string {
  if (out.stopReason === 'max_tokens') {
    return 'The answer was cut off before it finished — it ran out of room.'
  }
  const flat = out.parsed.success ? null : out.parsed.error.flatten()
  const fields: [string, string[] | undefined][] = flat ? Object.entries(flat.fieldErrors) : []
  const first = fields.length
    ? fields
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${v?.[0] ?? 'invalid'}`)
        .join('; ')
    : (flat?.formErrors ?? [])[0]
  return `Output failed validation after a repair retry — ${first || 'shape did not match'}`
}

export async function recordOutcome(req: RunRequest, out: RunOutcome): Promise<void> {
  if (!req.runId) return
  const model = MODEL_FOR_TIER[req.def.modelTier]
  await finishRun(req.userToken, req.runId, {
    status: out.parsed.success ? 'succeeded' : 'invalid_output',
    output: out.parsed.success ? out.parsed.data : undefined,
    error: out.parsed.success ? undefined : failureReason(out),
    input_tokens: out.totalIn,
    output_tokens: out.totalOut,
    cost_usd: costUSD(model, out.totalIn, out.totalOut),
    latency_ms: Date.now() - req.startedAt,
    timings: {
      ...out.timings,
      total_ms: Date.now() - req.startedAt,
      ...(out.stopReason ? { stop_reason: out.stopReason } : {}),
      ...(out.trimmed?.length ? { trimmed: out.trimmed } : {}),
      // the evidence, clipped: a failed run used to leave none at all
      ...(out.parsed.success ? {} : { raw: JSON.stringify(out.raw ?? null).slice(0, 4000) }),
    },
  })
}

export async function recordFailure(req: RunRequest, e: unknown): Promise<void> {
  if (!req.runId) return
  await finishRun(req.userToken, req.runId, {
    status: 'failed',
    error: String((e as Error)?.message || e),
    latency_ms: Date.now() - req.startedAt,
    timings: { ...req.timings, total_ms: Date.now() - req.startedAt },
  })
}
