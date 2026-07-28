import { z } from 'zod'
import { baseSystem, refLines, type ActionDef, type ThoughtRef } from '../types'

const REL_TYPES = [
  'relates_to',
  'depends_on',
  'contradicts',
  'supports',
  'inspired_by',
  'blocks',
  'part_of',
  'evolved_into',
  'duplicates',
  'answers',
] as const

const NEW_NODE_TYPES = ['concept', 'idea', 'question', 'action', 'decision'] as const

const Ref = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string().optional(),
  summary: z.string().nullable().optional(),
})

const Input = z.object({
  thoughts: z.array(Ref).min(1).max(120),
  focus: z.string().max(500).optional(), // optional user instruction
})

// A node ref is either an existing thought {id} or a new node {tempId,title,type}.
const NodeRef = z.union([
  z.object({ id: z.string() }),
  z.object({
    tempId: z.string(),
    title: z.string().min(1).max(120),
    type: z.enum(NEW_NODE_TYPES),
  }),
])

const Output = z.object({
  newNodes: z
    .array(
      z.object({
        tempId: z.string(),
        title: z.string().min(1).max(120),
        type: z.enum(NEW_NODE_TYPES),
      }),
    )
    .max(20),
  edges: z
    .array(
      z.object({
        from: NodeRef,
        to: NodeRef,
        relType: z.enum(REL_TYPES),
      }),
    )
    .max(150),
  insight: z.string().max(300),
})

export type MakeMindMapInput = z.infer<typeof Input>
export type MakeMindMapOutput = z.infer<typeof Output>

export const makeMindMap: ActionDef<MakeMindMapInput, MakeMindMapOutput> = {
  name: 'make_mind_map',
  version: 1,
  modelTier: 'smart',
  maxTokens: 4000,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    return {
      system: baseSystem(ctx),
      user:
        `The user selected these thoughts for a visual map:\n${refLines(input.thoughts as ThoughtRef[])}\n\n` +
        (input.focus ? `User instruction: ${input.focus}\n\n` : '') +
        `Propose structure:\n` +
        `- newNodes: up to 20 NEW organizing nodes (themes as "concept", open unknowns as "question", possible directions as "idea", concrete steps as "action", choices to make as "decision"). Give each a unique tempId ("n1","n2",...).\n` +
        `- edges: connect existing thoughts (by exact [id]) and new nodes (by tempId). Use part_of for theme membership, depends_on/blocks for ordering, contradicts for tensions, relates_to for loose association.\n` +
        `- insight: one sentence on the most useful pattern you noticed.\n` +
        `Keep the map readable: prefer a few strong themes over many weak ones. Every existing thought should connect to at least one node unless it is truly unrelated.`,
    }
  },
}
