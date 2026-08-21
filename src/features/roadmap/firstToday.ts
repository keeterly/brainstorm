// The one thing the sky is allowed to have an opinion about, and where it gets it.
//
// The sky has shown a "what to do next" bar at the foot of the glass for a long
// time, worked out by `nextAction` — a rule ladder over the whole graph. It is a
// good ladder. The trouble is that there are now two things in this app that
// answer "what should I do", and the last time that was true (the Current
// screen, which ran `prioritize` and stored its pick) the app could be caught
// telling you two different things about the same morning.
//
// So the bar keeps its place and gives up its opinion. What it shows is the
// first thing on today's roadmap — the same list, the same order, the same
// week's worth of room — and `nextAction` stays as the answer for a sky with no
// plans in it yet, which is a real state and the one every new user is in.
import { nextAction } from '@/domain/next-action'
import { placeWork, weeklyCapacity } from '@/domain/schedule'
import type { Relationship, Thought } from '@/domain/types'
import { pursued } from './gather'

export interface Suggestion {
  thought: Thought
  why: string
  /**
   * Which of the two answered.
   *
   * Structural, not a phrase to match on. The bar leads to the roadmap when the
   * roadmap is what spoke, and to the thing itself when the ladder did — and
   * deciding that by grepping the `why` for the word "roadmap" would mean any
   * rewording of a sentence silently changed where a tap goes.
   */
  from: 'roadmap' | 'ladder'
}

export function firstToday(
  thoughts: Thought[],
  rels: Relationship[],
  today: string,
): Suggestion | null {
  const steps = pursued(thoughts, rels).flatMap((g) => g.steps)
  if (steps.length) {
    const placement = placeWork({
      steps,
      rels,
      capacity: weeklyCapacity(thoughts, today),
      today,
    })
    const first = placement.days[0]
    // …only if the first day with anything on it is actually today. A bar that
    // says "next" about Thursday is telling you to do something you cannot
    // start, which is worse than saying nothing.
    if (first && first.date === today && first.items.length) {
      const p = first.items[0]
      return {
        thought: p.t,
        why: p.late && p.t.due_date ? 'late, and first today' : 'first on your roadmap today',
        from: 'roadmap',
      }
    }
  }
  // nothing planned, or nothing due to start today: the ladder still knows what
  // is worth picking up, and an empty foot of the sky helps nobody
  const fallback = nextAction(thoughts, rels, today)
  return fallback ? { ...fallback, from: 'ladder' } : null
}
