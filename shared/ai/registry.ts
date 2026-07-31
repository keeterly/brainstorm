import type { ActionDef } from './types'
import { classifyThought } from './actions/classify-thought'
import { prioritize } from './actions/prioritize'
import { absorb } from './actions/absorb'
import { organize } from './actions/organize'
import { namePool } from './actions/name-pool'
import { cluster } from './actions/cluster'
import { deepen } from './actions/deepen'
import { answer } from './actions/answer'
import { gauge } from './actions/gauge'
import { notice } from './actions/notice'
import { reshape } from './actions/reshape'
import { draft } from './actions/draft'
import { remember } from './actions/remember'
import { rain } from './actions/rain'
import { evaporate } from './actions/evaporate'

// Six actions came out of here at once: summarize, clarify_question,
// find_related, to_goal, make_mind_map and generate_roadmap.
//
// Four of them existed to serve one screen — a thought detail page reachable
// from a single link, behind a fold, in a list of *finished* work — and the sky
// had already replaced every one of them. `to_goal` happens by dragging things
// together; `generate_roadmap` is `rain` and `deepen`, which produce real
// thoughts rather than a second, parallel model of what work is; `find_related`
// is the kinship threading the sky draws continuously; `clarify_question` is
// the ask moon. The other two, `make_mind_map` and `summarize`, had no caller
// at all outside this file and its test.
//
// An action that nothing calls is not free. It is a schema to keep valid, a
// prompt to keep true, and a thing a reader has to understand before they can
// be sure it is not the one they are looking for.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ACTION_REGISTRY: Record<string, ActionDef<any, any>> = {
  [classifyThought.name]: classifyThought,
  [prioritize.name]: prioritize,
  [absorb.name]: absorb,
  [organize.name]: organize,
  [namePool.name]: namePool,
  [cluster.name]: cluster,
  [deepen.name]: deepen,
  [answer.name]: answer,
  [gauge.name]: gauge,
  [notice.name]: notice,
  [reshape.name]: reshape,
  [draft.name]: draft,
  [remember.name]: remember,
  [rain.name]: rain,
  [evaporate.name]: evaporate,
}

export type ActionName = keyof typeof ACTION_REGISTRY
