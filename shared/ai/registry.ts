import type { ActionDef } from './types'
import { classifyThought } from './actions/classify-thought'
import { summarize } from './actions/summarize'
import { clarifyQuestion } from './actions/clarify-question'
import { findRelated } from './actions/find-related'
import { toGoal } from './actions/to-goal'
import { makeMindMap } from './actions/make-mind-map'
import { generateRoadmap } from './actions/generate-roadmap'
import { prioritize } from './actions/prioritize'
import { distillMemory } from './actions/distill-memory'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ACTION_REGISTRY: Record<string, ActionDef<any, any>> = {
  [classifyThought.name]: classifyThought,
  [summarize.name]: summarize,
  [clarifyQuestion.name]: clarifyQuestion,
  [findRelated.name]: findRelated,
  [toGoal.name]: toGoal,
  [makeMindMap.name]: makeMindMap,
  [generateRoadmap.name]: generateRoadmap,
  [prioritize.name]: prioritize,
  [distillMemory.name]: distillMemory,
}

export type ActionName = keyof typeof ACTION_REGISTRY
