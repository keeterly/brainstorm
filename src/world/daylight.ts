// The sky knows the hour. Not three themes that switch, but one continuous
// cycle the room drifts through — so glancing at it tells you roughly where
// you are in the day without a clock, and the light is warm when you are
// starting, clear when you are working, and cool when you should be stopping.
//
// It stays a dark world throughout. What moves is hue and lift: dawn carries a
// rose warmth low on the horizon, midday goes clear and blue and slightly
// brighter, evening turns amber, night settles into deep indigo.

export interface SkyColors {
  /** the glow above, where the night is thinnest */
  top: [number, number, number]
  /** the light at the horizon, behind the water */
  horizon: [number, number, number]
  /** the body of the ocean */
  water: [number, number, number]
  /** 0 cool … 1 warm — drives the light shaft's temperature */
  warm: number
  /** what to call this hour */
  name: 'night' | 'dawn' | 'morning' | 'midday' | 'afternoon' | 'evening'
}

type Anchor = SkyColors & { at: number }

// Anchored around the waking day; everything between is interpolated.
const CYCLE: Anchor[] = [
  { at: 0, name: 'night', top: [8, 11, 24], horizon: [10, 21, 38], water: [24, 58, 104], warm: 0.05 },
  { at: 5, name: 'dawn', top: [22, 16, 32], horizon: [52, 30, 40], water: [64, 56, 106], warm: 0.62 },
  { at: 8, name: 'morning', top: [18, 24, 40], horizon: [46, 38, 44], water: [46, 100, 148], warm: 0.44 },
  { at: 12, name: 'midday', top: [14, 28, 50], horizon: [20, 44, 68], water: [40, 116, 176], warm: 0.14 },
  { at: 16, name: 'afternoon', top: [20, 23, 42], horizon: [48, 36, 44], water: [56, 102, 150], warm: 0.4 },
  { at: 19, name: 'evening', top: [22, 16, 34], horizon: [56, 32, 36], water: [72, 66, 118], warm: 0.72 },
  { at: 22, name: 'night', top: [12, 13, 28], horizon: [20, 18, 34], water: [34, 62, 110], warm: 0.22 },
  { at: 24, name: 'night', top: [8, 11, 24], horizon: [10, 21, 38], water: [24, 58, 104], warm: 0.05 },
]

const mix = (a: number, b: number, k: number) => a + (b - a) * k
const mix3 = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => [
  Math.round(mix(a[0], b[0], k)),
  Math.round(mix(a[1], b[1], k)),
  Math.round(mix(a[2], b[2], k)),
]

/** The sky at a given local time. Pure — the hour is the only input. */
export function daylightAt(date: Date): SkyColors {
  const h = date.getHours() + date.getMinutes() / 60
  let i = 0
  while (i < CYCLE.length - 2 && CYCLE[i + 1].at <= h) i++
  const a = CYCLE[i]
  const b = CYCLE[i + 1]
  const span = b.at - a.at || 1
  const k = Math.min(1, Math.max(0, (h - a.at) / span))
  return {
    top: mix3(a.top, b.top, k),
    horizon: mix3(a.horizon, b.horizon, k),
    water: mix3(a.water, b.water, k),
    warm: mix(a.warm, b.warm, k),
    name: nameHour(h),
  }
}

// Naming is not interpolation — 3am is night however close it sits to dawn.
function nameHour(h: number): SkyColors['name'] {
  if (h < 4.5) return 'night'
  if (h < 7.5) return 'dawn'
  if (h < 11) return 'morning'
  if (h < 15) return 'midday'
  if (h < 18) return 'afternoon'
  if (h < 21.5) return 'evening'
  return 'night'
}

const rgb = (c: [number, number, number], alpha = 1) =>
  alpha === 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${alpha})`

// The live palette, read by the canvas each frame without touching the DOM.
export const sky: SkyColors = daylightAt(new Date())

/** Recompute for now and publish to CSS. Cheap; safe to call on a timer. */
export function tickDaylight(now = new Date()) {
  const s = daylightAt(now)
  sky.top = s.top
  sky.horizon = s.horizon
  sky.water = s.water
  sky.warm = s.warm
  sky.name = s.name
  if (typeof document === 'undefined') return s
  const r = document.documentElement.style
  r.setProperty('--sky-top', rgb(s.top))
  r.setProperty('--sky-horizon', rgb(s.horizon, 0.55))
  r.setProperty('--sky-ground', rgb(mix3(s.top, [3, 4, 9], 0.72)))
  r.setProperty('--sky-warm', s.warm.toFixed(3))
  // the glass takes the hour with it: cool water blue at midday, amber at dusk
  const glow = mix3([122, 215, 255], [255, 184, 118], s.warm)
  r.setProperty('--drop-glow', rgb(glow, 0.2))
  r.setProperty('--drop-rim', rgb(glow, 0.17))
  // the echo a live drop sends out carries the same hour, but has to survive
  // being drawn as a hairline — its own alpha does the fading
  r.setProperty('--drop-echo', rgb(glow, 0.7))
  return s
}
