/*
 * What somebody sees the first time, instead of nothing.
 *
 * A brand-new account hydrates to eight empty arrays and lands on a black
 * ocean with "What's on your mind?" floating in it. That is an honest first
 * impression and a hostile one: the app's own notes record a playtester
 * spending the better part of ten minutes finding the hold gesture, and that
 * was somebody who had been *told* the app existed for capturing thoughts.
 *
 * So a few things are already up there. Not a tutorial — a tutorial is a thing
 * you dismiss and then still do not know the gesture. These are real thoughts
 * in the real sky, of the kind the app is for, and every one of them can be
 * put away with the gesture the app wants you to learn.
 *
 * Three rules they all follow:
 *
 *   1. **Nothing that costs money.** No goals ripe for ⚡, no questions that
 *      invite `answer it`. A tester's first tap should not be a bill, and on
 *      a deployment with invites on it would be a refusal instead.
 *   2. **They say what they are.** `extra.example` marks them, the sky can
 *      show it, and "clear the examples" can find them again later.
 *   3. **One of them is about the app.** The gesture nobody guesses is written
 *      down, in the one place somebody is definitely looking.
 */
import type { NewThought } from '@/store/graph'

export const EXAMPLES: NewThought[] = [
  {
    raw_content: 'Hold anywhere on the empty sky to write something down',
    title: 'Hold the sky to write',
    type: 'note',
    // the one that is not really a thought — it is the gesture, in the only
    // place somebody is definitely looking on their first morning
    extra: { example: true },
  },
  {
    raw_content:
      'Drag one thought onto another and they become a group. Tap a group to go inside it, tap it again for its plan.',
    title: 'Drag two together to make a group',
    type: 'note',
    extra: { example: true },
  },
  {
    raw_content:
      'Something you keep meaning to get to. Put a real one here and the app has something true to work with.',
    title: 'A thing you keep meaning to do',
    type: 'note',
    extra: { example: true },
  },
  {
    raw_content:
      'Anything you are chewing on. It does not have to be tidy — that is the app’s job, not yours.',
    title: 'Something you are chewing on',
    type: 'note',
    extra: { example: true },
  },
]

/** Was this one of the four we put there? */
export function isExample(extra: unknown): boolean {
  return !!extra && typeof extra === 'object' && (extra as Record<string, unknown>).example === true
}

/**
 * Should a sky be seeded?
 *
 * Only a genuinely empty one, and only once. `hydrated` matters: seeding
 * against a store that has not loaded yet would put four examples on top of
 * somebody's real thoughts every time the network was slow — which is the
 * worst thing this file could possibly do, so it is the condition written
 * first and the one the test is about.
 *
 * The local mark is per user, so signing in on a second device does not seed
 * again — the thoughts are already in the database by then, and the emptiness
 * check catches it. The mark is only there for the case where somebody clears
 * all four before their first sync lands.
 */
export function shouldSeed(
  s: { hydrated: boolean; offline: boolean; thoughts: unknown[] },
  userId: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): boolean {
  if (!s.hydrated || s.offline) return false
  if (s.thoughts.length) return false
  try {
    if (storage.getItem(mark(userId))) return false
  } catch {
    // a browser that refuses storage is not a reason to leave the sky empty
  }
  return true
}

export function markSeeded(userId: string, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(mark(userId), '1')
  } catch {
    /* ignore */
  }
}

const mark = (userId: string) => `bs-first-sky-${userId}`
