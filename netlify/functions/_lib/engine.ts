// The part of /api/ai that actually runs an action, shared by the synchronous
// endpoint and the background one.
//
// Some actions cannot finish inside a request. Deepening one idea with real
// research measured at fifty-one seconds against the live model — far past what
// a synchronous function is allowed — so those runs happen in a background
// function and the answer is collected from agent_runs afterwards. Both paths
// have to log identically, or the row the client is waiting on never arrives.
import type { z } from 'zod'
import { ACTION_REGISTRY } from '../../../shared/ai/registry'
import { costUSD, MODEL_FOR_TIER } from '../../../shared/ai/pricing'
import type { ActionDef, PromptCtx } from '../../../shared/ai/types'
import { AnthropicProvider } from './provider'
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
}

export interface RunOutcome {
  parsed: z.SafeParseReturnType<unknown, unknown>
  totalIn: number
  totalOut: number
  model: string
}

export function actionFor(name: string): ActionDef<unknown, unknown> | undefined {
  return ACTION_REGISTRY[name]
}

export async function runToValidated(req: RunRequest): Promise<RunOutcome> {
  const { def, input, ctx, apiKey, onDelta } = req
  const model = MODEL_FOR_TIER[def.modelTier]
  const prompt = def.buildPrompt(input, ctx)
  const provider = new AnthropicProvider(apiKey)

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
        searchMaxUses: def.searchMaxUses,
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

  let result = await attempt('')
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
    result = await attempt(repair)
    totalIn += result.usage.inputTokens
    totalOut += result.usage.outputTokens
    parsed = def.outputSchema.safeParse(result.json)
  }
  return { parsed, totalIn, totalOut, model: result.model }
}

export async function recordOutcome(req: RunRequest, out: RunOutcome): Promise<void> {
  if (!req.runId) return
  const model = MODEL_FOR_TIER[req.def.modelTier]
  await finishRun(req.userToken, req.runId, {
    status: out.parsed.success ? 'succeeded' : 'invalid_output',
    output: out.parsed.success ? out.parsed.data : undefined,
    error: out.parsed.success ? undefined : 'Output failed schema validation after repair retry',
    input_tokens: out.totalIn,
    output_tokens: out.totalOut,
    cost_usd: costUSD(model, out.totalIn, out.totalOut),
    latency_ms: Date.now() - req.startedAt,
  })
}

export async function recordFailure(req: RunRequest, e: unknown): Promise<void> {
  if (!req.runId) return
  await finishRun(req.userToken, req.runId, {
    status: 'failed',
    error: String((e as Error)?.message || e),
    latency_ms: Date.now() - req.startedAt,
  })
}
