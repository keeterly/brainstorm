import type { z } from 'zod'

export type ModelTier = 'fast' | 'smart'

export interface PromptCtx {
  nowISO: string
  tzOffsetMin: number
  memory: string[]
}

export interface BuiltPrompt {
  system: string
  user: string
  /** Images the model should look at alongside the text. */
  images?: PromptImage[]
}

export interface PromptImage {
  /** image/jpeg, image/png, image/webp or image/gif */
  mediaType: string
  /** raw base64 — no data: prefix */
  dataB64: string
}

// A named, versioned, schema-validated AI action. Input and output schemas are
// the single source of truth for both the client (types via z.infer) and the
// server (runtime validation + the forced tool-call JSON schema).
export interface ActionDef<I = unknown, O = unknown> {
  name: string
  version: number
  modelTier: ModelTier
  maxTokens: number
  stream?: boolean
  /** Let this action look things up on the web, up to this many searches.
   *  Absent or zero means it answers from what it was given. */
  searchMaxUses?: number
  inputSchema: z.ZodType<I>
  outputSchema: z.ZodType<O>
  buildPrompt(input: I, ctx: PromptCtx): BuiltPrompt
}

// Compact reference to an existing thought, passed into prompts.
// The model must reference thoughts by [id] — never by echoed wording.
export interface ThoughtRef {
  id: string
  title: string
  type?: string
  summary?: string | null
  due?: string | null
  effort?: number | null
}

export function refLines(refs: ThoughtRef[]): string {
  return refs
    .map((r) => {
      const bits = [`[${r.id}]`, r.title]
      if (r.type) bits.push(`(${r.type})`)
      if (r.due) bits.push(`due ${r.due}`)
      if (r.summary) bits.push(`— ${r.summary}`)
      return bits.join(' ')
    })
    .join('\n')
}

export function baseSystem(ctx: PromptCtx): string {
  const mem = ctx.memory.length
    ? `\n\nWhat you know about this user (from their editable memory):\n${ctx.memory.map((m) => `- ${m}`).join('\n')}`
    : ''
  return (
    `You are the thinking engine inside Brainstorm, an AI Thinking OS. ` +
    `You help people whose ideas do not begin as organized tasks: you classify, connect, structure, and prioritize their thoughts. ` +
    `Be concise and concrete. Never invent thought ids — only use ids given to you. ` +
    `Right now it is ${ctx.nowISO} (user timezone offset ${ctx.tzOffsetMin} minutes).` +
    mem
  )
}
