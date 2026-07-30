// Being generous is not the same as being wrong.
//
// Two runs of ⚡ against a real goal — "PFW Travel Booking", five things already
// under it — spent eighty-five seconds each doing live research and then threw
// all of it away: "output failed schema validation after repair retry". The
// research was fine. The model had written eleven steps where the schema allows
// ten, or a `why` a few characters past its limit, and Zod is right to refuse
// it and the app was wrong about what to do next.
//
// Because the failure is over-supply, not nonsense. There is a correct answer
// sitting there and one extra item on the end of it. So before the engine
// spends a second model call re-asking — a minute of the user's life, and the
// same over-supply about half the time — it clips what came back to the limits
// the tool schema already stated, and tries again.
//
// It clips only two things, both of which are pure excess:
//   - an array longer than maxItems, cut to maxItems
//   - a string longer than maxLength, cut to maxLength
// Never a number, never a missing field, never an unexpected value. Those are
// the model misunderstanding the question, and quietly inventing a repair for
// them would turn a legible failure into a wrong answer.

/** The shape of what zodToJsonSchema hands back, to the depth we care about. */
interface Node {
  type?: string | string[]
  properties?: Record<string, Node>
  items?: Node | Node[]
  additionalProperties?: Node | boolean
  maxItems?: number
  maxLength?: number
  anyOf?: Node[]
  oneOf?: Node[]
  allOf?: Node[]
}

/** True when this clipped anything at all. */
export interface TrimResult<T = unknown> {
  value: T
  trimmed: boolean
  /** what was cut, in plain words, for the record */
  notes: string[]
}

export function trimToSchema(schema: unknown, value: unknown): TrimResult {
  const notes: string[] = []
  const out = walk(schema as Node, value, '', notes)
  return { value: out, trimmed: notes.length > 0, notes }
}

function walk(node: Node | undefined, value: unknown, path: string, notes: string[]): unknown {
  if (!node || value === null || value === undefined) return value

  // A union: use the first branch the value could plausibly be. Getting this
  // wrong is harmless — a branch that does not match simply clips nothing.
  const union = node.anyOf ?? node.oneOf
  if (union?.length) {
    for (const branch of union) {
      if (fits(branch, value)) return walk(branch, value, path, notes)
    }
    return value
  }
  if (node.allOf?.length) {
    let v: unknown = value
    for (const part of node.allOf) v = walk(part, v, path, notes)
    return v
  }

  if (Array.isArray(value)) {
    const item = Array.isArray(node.items) ? node.items[0] : node.items
    let arr = value.map((v, i) => walk(item, v, `${path}[${i}]`, notes))
    if (typeof node.maxItems === 'number' && arr.length > node.maxItems) {
      notes.push(`${label(path)}: kept ${node.maxItems} of ${arr.length}`)
      arr = arr.slice(0, node.maxItems)
    }
    return arr
  }

  if (typeof value === 'string') {
    if (typeof node.maxLength === 'number' && value.length > node.maxLength) {
      notes.push(`${label(path)}: shortened from ${value.length} to ${node.maxLength}`)
      // clip on a word where one is near the end, so it does not stop mid-word
      const cut = value.slice(0, node.maxLength)
      const space = cut.lastIndexOf(' ')
      return space > node.maxLength - 12 ? cut.slice(0, space) : cut
    }
    return value
  }

  if (typeof value === 'object') {
    const src = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(src)) {
      const child =
        node.properties?.[k] ??
        (typeof node.additionalProperties === 'object' ? node.additionalProperties : undefined)
      out[k] = walk(child, v, path ? `${path}.${k}` : k, notes)
    }
    return out
  }

  return value
}

/** Could this value be this branch of a union? Deliberately shallow. */
function fits(node: Node, value: unknown): boolean {
  const t = node.type
  if (!t) return true
  const types = Array.isArray(t) ? t : [t]
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
  return types.some((x) => x === actual || (x === 'integer' && actual === 'number'))
}

const label = (path: string) => path || 'the result'
