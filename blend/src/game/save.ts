// What the phone remembers between one sitting and the next: how far you got,
// and your best line through each sky. Nothing else, nowhere else — no
// account, no server, no telemetry. A game this size has no business knowing
// anything about the person playing it.
const KEY = 'blend.progress.v1'

export interface Save {
  /** the highest level finished */
  done: number
  /** fewest moves per level */
  best: Record<number, number>
  /** whether the title card has been read */
  greeted: boolean
}

const empty: Save = { done: 0, best: {}, greeted: false }

export function load(): Save {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...empty }
    const v = JSON.parse(raw) as Partial<Save>
    return {
      done: typeof v.done === 'number' ? v.done : 0,
      best: v.best && typeof v.best === 'object' ? v.best : {},
      greeted: !!v.greeted,
    }
  } catch {
    // private browsing, a full disk, a corrupt value — none of them are worth
    // a broken game, and starting over is a survivable loss
    return { ...empty }
  }
}

export function save(s: Save): Save {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* played this session only, then */
  }
  return s
}

export function finished(s: Save, level: number, moves: number): Save {
  const best = s.best[level]
  return save({
    ...s,
    done: Math.max(s.done, level),
    best: { ...s.best, [level]: best === undefined ? moves : Math.min(best, moves) },
  })
}
