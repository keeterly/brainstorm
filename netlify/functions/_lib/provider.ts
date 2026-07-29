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
  }): Promise<CompleteResult>
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

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
  }): Promise<CompleteResult> {
    const emitTool = {
      name: 'emit',
      description: 'Emit the structured result. Always call this exactly once.',
      input_schema: zodToJsonSchema(opts.outputSchema, { $refStrategy: 'none' }),
    }
    const body = {
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      // an image-bearing turn becomes content blocks; text-only stays a plain
      // string so nothing about the existing actions changes
      messages: [
        {
          role: 'user',
          content: opts.images?.length
            ? [
                ...opts.images.map((im) => ({
                  type: 'image' as const,
                  source: { type: 'base64' as const, media_type: im.mediaType, data: im.dataB64 },
                })),
                { type: 'text' as const, text: opts.user },
              ]
            : opts.user,
        },
      ],
      tools: [emitTool],
      tool_choice: { type: 'tool', name: 'emit' },
      stream: !!opts.stream,
    }
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

    if (opts.stream && r.body) {
      return this.readStream(r.body, opts.model, opts.onDelta)
    }

    const data = (await r.json()) as {
      content?: { type: string; input?: unknown }[]
      usage?: { input_tokens?: number; output_tokens?: number }
      model?: string
    }
    const toolBlock = (data.content || []).find((b) => b.type === 'tool_use')
    if (!toolBlock) throw new Error('Model did not emit structured output')
    return {
      json: toolBlock.input,
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      },
      model: data.model ?? opts.model,
    }
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
          delta?: { type?: string; partial_json?: string }
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
        if (ev.type === 'message_delta' && ev.usage?.output_tokens) {
          outputTokens = ev.usage.output_tokens
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
    return { json, usage: { inputTokens, outputTokens }, model }
  }
}
