// Model-provider isolation. The rest of the engine talks to LLMProvider only,
// so swapping vendors means one new implementation of this interface.
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { z } from 'zod'

export interface Usage {
  inputTokens: number
  outputTokens: number
}

export interface CompleteResult {
  /** Parsed JSON emitted through the forced tool call. */
  json: unknown
  usage: Usage
  model: string
  /** What it actually went and looked up, when it was allowed to look. */
  searched?: string[]
  /** Why the model stopped. 'max_tokens' means the answer was cut off, which
   *  is a completely different failure from the answer being wrong, and used
   *  to arrive dressed as the same one. */
  stopReason?: string
}

export interface LLMProvider {
  /**
   * Run a completion that MUST return structured JSON matching the schema.
   * Implementations force a tool call so no fence-stripping is ever needed.
   * onDelta (optional) receives raw partial-JSON chunks as they stream.
   */
  completeStructured(opts: {
    model: string
    maxTokens: number
    system: string
    user: string
    images?: { mediaType: string; dataB64: string }[]
    outputSchema: z.ZodType<unknown>
    stream?: boolean
    onDelta?: (chunk: string) => void
    /** Let it search the web up to this many times before it answers. */
    searchMaxUses?: number
  }): Promise<CompleteResult>
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

interface Block {
  type: string
  name?: string
  input?: unknown
}
interface AnthropicResponse {
  content?: Block[]
  usage?: { input_tokens?: number; output_tokens?: number }
  model?: string
  stop_reason?: string
}

/** What it typed into the search box, for the record shown to the user. */
function queriesIn(content: Block[]): string[] | undefined {
  const qs = content
    .filter((b) => b.type === 'server_tool_use' && b.name === 'web_search')
    .map((b) => (b.input as { query?: string } | undefined)?.query)
    .filter((q): q is string => !!q)
  return qs.length ? qs : undefined
}

export class AnthropicProvider implements LLMProvider {
  constructor(private apiKey: string) {}

  async completeStructured(opts: {
    model: string
    maxTokens: number
    system: string
    user: string
    images?: { mediaType: string; dataB64: string }[]
    outputSchema: z.ZodType<unknown>
    stream?: boolean
    onDelta?: (chunk: string) => void
    searchMaxUses?: number
  }): Promise<CompleteResult> {
    const emitTool = {
      name: 'emit',
      description: 'Emit the structured result. Always call this exactly once.',
      input_schema: zodToJsonSchema(opts.outputSchema, { $refStrategy: 'none' }),
    }
    // Searching and forcing a tool call are mutually exclusive: a forced emit
    // fires immediately and never gets the chance to look anything up. So when
    // research is allowed the choice is left open, and if it finishes without
    // emitting, a second pass forces it with everything it found in hand.
    const searching = (opts.searchMaxUses ?? 0) > 0
    const tools: unknown[] = [emitTool]
    if (searching) {
      tools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: opts.searchMaxUses })
    }
    const userContent = opts.images?.length
      ? [
          ...opts.images.map((im) => ({
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: im.mediaType, data: im.dataB64 },
          })),
          { type: 'text' as const, text: opts.user },
        ]
      : opts.user
    const body = {
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      // an image-bearing turn becomes content blocks; text-only stays a plain
      // string so nothing about the existing actions changes
      messages: [{ role: 'user', content: userContent }],
      tools,
      tool_choice: searching ? { type: 'auto' } : { type: 'tool', name: 'emit' },
      stream: !!opts.stream,
    }
    const r = await this.post(body)

    if (opts.stream && r.body) {
      return this.readStream(r.body, opts.model, opts.onDelta)
    }

    const data = (await r.json()) as AnthropicResponse
    let content = data.content || []
    let usage = data.usage
    let stopReason = data.stop_reason
    const searched = queriesIn(content)

    let toolBlock = content.find((b) => b.type === 'tool_use' && b.name === 'emit')
    if (!toolBlock && searching) {
      // it went looking and stopped to think out loud; ask again, holding it to
      // the schema this time, with the searches still on the table
      const second = (await (
        await this.post({
          ...body,
          messages: [
            { role: 'user', content: userContent },
            { role: 'assistant', content },
            { role: 'user', content: 'Now emit the result.' },
          ],
          tool_choice: { type: 'tool', name: 'emit' },
        })
      ).json()) as AnthropicResponse
      content = second.content || []
      stopReason = second.stop_reason
      toolBlock = content.find((b) => b.type === 'tool_use' && b.name === 'emit')
      usage = {
        input_tokens: (usage?.input_tokens ?? 0) + (second.usage?.input_tokens ?? 0),
        output_tokens: (usage?.output_tokens ?? 0) + (second.usage?.output_tokens ?? 0),
      }
    }
    if (!toolBlock) throw new Error('Model did not emit structured output')
    return {
      json: toolBlock.input,
      usage: {
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
      },
      model: data.model ?? opts.model,
      searched,
      stopReason,
    }
  }

  private async post(body: unknown): Promise<Response> {
    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    })
    if (!r.ok) {
      let msg = `HTTP ${r.status}`
      try {
        const e = (await r.json()) as { error?: { message?: string } }
        if (e.error?.message) msg = e.error.message
      } catch {
        /* keep status text */
      }
      const err = new Error(msg) as Error & { status?: number }
      err.status = r.status
      throw err
    }
    return r
  }

  private async readStream(
    body: ReadableStream<Uint8Array>,
    model: string,
    onDelta?: (chunk: string) => void,
  ): Promise<CompleteResult> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let jsonBuf = ''
    let inputTokens = 0
    let outputTokens = 0
    let stopReason: string | undefined
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        let ev: {
          type?: string
          delta?: { type?: string; partial_json?: string; stop_reason?: string }
          message?: { usage?: { input_tokens?: number } }
          usage?: { output_tokens?: number; input_tokens?: number }
        }
        try {
          ev = JSON.parse(payload)
        } catch {
          continue
        }
        if (ev.type === 'message_start' && ev.message?.usage?.input_tokens) {
          inputTokens = ev.message.usage.input_tokens
        }
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'input_json_delta') {
          const chunk = ev.delta.partial_json ?? ''
          jsonBuf += chunk
          if (chunk && onDelta) onDelta(chunk)
        }
        if (ev.type === 'message_delta') {
          if (ev.usage?.output_tokens) outputTokens = ev.usage.output_tokens
          if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason
        }
      }
    }
    if (!jsonBuf) throw new Error('Model did not emit structured output')
    let json: unknown
    try {
      json = JSON.parse(jsonBuf)
    } catch {
      throw new Error('Streamed structured output was not valid JSON')
    }
    return { json, usage: { inputTokens, outputTokens }, model, stopReason }
  }
}
