import { z } from 'zod'
import { baseSystem, refLines, type ActionDef, type ThoughtRef } from '../types'

// Absorb — new water falls on an existing sky and the sky rearranges.
// Ported from the original Brainstorm's best mechanic ("✦ Adjust"): given the
// user's whole open inventory, the model PREFERS updating what exists over
// creating duplicates. An all-empty output means "nothing to adjust" and the
// client falls back to plain capture — absorb can never lose the user's text.

const Ref = z.object({
  id: z.string(),
  title: z.string().max(300),
  type: z.string().max(30).optional(),
  summary: z.string().max(500).nullable().optional(),
  due: z.string().nullable().optional(),
})

const Input = z.object({
  text: z.string().min(1).max(8000),
  thoughts: z.array(Ref).max(200),
})

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

const Output = z.object({
  updates: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(200).optional(),
        summary: z.string().max(500).nullable().optional(),
        due_date: z.string().regex(ISO_DAY).nullable().optional(),
      }),
    )
    .max(20),
  completions: z.array(z.string()).max(20),
  snoozes: z.array(z.object({ id: z.string(), until: z.string().regex(ISO_DAY) })).max(20),
  additions: z
    .array(
      z.object({
        tempId: z.string(),
        title: z.string().min(1).max(200),
        type: z.enum(['note', 'idea', 'task', 'action', 'question', 'goal']),
        due_date: z.string().regex(ISO_DAY).nullable().optional(),
        // parent goal: an existing thought id, or the tempId of a goal added above
        part_of: z.string().optional(),
      }),
    )
    .max(30),
  note: z.string().max(240),
})

export type AbsorbInput = z.infer<typeof Input>
export type AbsorbOutput = z.infer<typeof Output>

export function absorbIsEmpty(o: AbsorbOutput): boolean {
  return !o.updates.length && !o.completions.length && !o.snoozes.length && !o.additions.length
}

export const absorb: ActionDef<AbsorbInput, AbsorbOutput> = {
  name: 'absorb',
  version: 1,
  modelTier: 'smart',
  maxTokens: 2000,
  inputSchema: Input,
  outputSchema: Output,
  buildPrompt(input, ctx) {
    return {
      system: baseSystem(ctx),
      user:
        `The user pasted new information into their thinking space. Their current open thoughts are listed below with ids. ` +
        `Work out how the new text CHANGES what already exists — strongly prefer adjusting existing thoughts over creating new ones. ` +
        `Only add a thought when the text genuinely contains something new.\n\n` +
        `Current thoughts:\n${refLines(input.thoughts as ThoughtRef[])}\n\n` +
        `New text:\n"""${input.text}"""\n\n` +
        `Return:\n` +
        `- updates: existing thoughts whose title/summary/due_date should change (only changed fields, only real ids)\n` +
        `- completions: ids the text implies are now done\n` +
        `- snoozes: ids to defer, each with an ISO date (YYYY-MM-DD)\n` +
        `- additions: genuinely new thoughts (unique tempIds like "t1"; use part_of to attach a step to a goal id or to an added goal's tempId)\n` +
        `- note: one plain sentence describing what you adjusted, written to the user\n\n` +
        `If the text is simply a new standalone thought with no bearing on anything listed, return every array EMPTY and an empty-ish note — ` +
        `the app will capture it verbatim instead. Never restate an existing thought as an addition.`,
    }
  },
}
