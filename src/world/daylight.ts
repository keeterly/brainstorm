// The sky knows the hour. Not three themes that switch, but one continuous
// cycle the room drifts through — so glancing at it tells you roughly where
// you are in the day without a clock, and the light is warm when you are
// starting, clear when you are working, and cool when you should be stopping.
//
// It stays a dark world throughout. What moves is hue and lift: dawn carries a
// rose warmth low on the horizon, midday goes clear and blue and slightly
// brighter, evening turns amber, night settles into deep indigo.

type RGB = [number, number, number]

export interface SkyColors {
  /** the glow above, where the night is thinnest */
  top: RGB
  /** the light at the horizon, behind the water */
  horizon: RGB
  /** the body of the ocean */
  water: RGB
  /** the hour's single accent — every lit thing in the app takes this */
  accent: RGB
  /** the hue the room's surfaces are lit by: glass, sheets, hairlines */
  surface: RGB
  /** the floor the whole app stands on */
  ground: RGB
  /** 0 cool … 1 warm — drives the light shaft's temperature */
  warm: number
  /** what to call this hour */
  name: 'night' | 'dawn' | 'morning' | 'midday' | 'afternoon' | 'evening'
}

type Anchor = SkyColors & { at: number }

// Anchored around the waking day; everything between is interpolated.
//
// The world stays dark throughout — this is not a light theme at noon. What
// travels is hue and energy: indigo through the night, rose at first light,
// clear blue while you are working, gold as it tips over, orange at sunset.
// One accent carries the hour into every view, so the app feels like the same
// room at a different time rather than a different app.
const CYCLE: Anchor[] = [
  { at: 0, name: 'night', top: [10, 12, 30], horizon: [22, 32, 72], water: [22, 52, 104], warm: 0.05,
    accent: [126, 158, 240], surface: [20, 24, 38], ground: [4, 5, 12] },
  // night holds its own colour until first light is genuinely near — without
  // this, 2am is already a third of the way to dawn
  { at: 3.5, name: 'night', top: [10, 12, 30], horizon: [22, 32, 72], water: [22, 52, 104], warm: 0.05,
    accent: [126, 158, 240], surface: [20, 24, 38], ground: [4, 5, 12] },
  { at: 5.5, name: 'dawn', top: [42, 20, 38], horizon: [140, 54, 70], water: [86, 60, 108], warm: 0.62,
    accent: [255, 162, 172], surface: [32, 24, 34], ground: [10, 6, 12] },
  { at: 8, name: 'morning', top: [18, 32, 58], horizon: [56, 84, 122], water: [40, 108, 160], warm: 0.4,
    accent: [142, 206, 255], surface: [23, 29, 40], ground: [5, 8, 14] },
  { at: 12, name: 'midday', top: [12, 38, 74], horizon: [32, 90, 146], water: [32, 124, 196], warm: 0.12,
    accent: [122, 215, 255], surface: [20, 28, 42], ground: [4, 7, 15] },
  { at: 16, name: 'afternoon', top: [40, 32, 44], horizon: [146, 88, 48], water: [70, 106, 148], warm: 0.44,
    accent: [255, 200, 132], surface: [30, 27, 36], ground: [9, 7, 12] },
  { at: 19, name: 'evening', top: [48, 22, 32], horizon: [182, 68, 24], water: [98, 70, 110], warm: 0.78,
    accent: [255, 148, 88], surface: [34, 24, 30], ground: [12, 6, 10] },
  { at: 22, name: 'night', top: [18, 16, 40], horizon: [44, 34, 78], water: [34, 58, 110], warm: 0.22,
    accent: [150, 152, 244], surface: [24, 24, 40], ground: [6, 6, 14] },
  { at: 24, name: 'night', top: [10, 12, 30], horizon: [22, 32, 72], water: [22, 52, 104], warm: 0.05,
    accent: [126, 158, 240], surface: [20, 24, 38], ground: [4, 5, 12] },
]

const mix = (a: number, b: number, k: number) => a + (b - a) * k
const mix3 = (a: RGB, b: RGB, k: number): RGB => [
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
    accent: mix3(a.accent, b.accent, k),
    surface: mix3(a.surface, b.surface, k),
    ground: mix3(a.ground, b.ground, k),
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

const rgb = (c: RGB, alpha = 1) =>
  alpha === 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${alpha})`

// The live palette, read by the canvas each frame without touching the DOM.
export const sky: SkyColors = daylightAt(new Date())

/**
 * Recompute for now and publish to CSS. Cheap; safe to call on a timer.
 *
 * These land as inline custom properties on <html>, so they override the
 * defaults in tokens.css without any component knowing the time of day —
 * anything already drawn with --accent, --glass or --ground travels with the
 * hour for free. tokens.css stays the palette you get before this first runs.
 */
export function tickDaylight(now = new Date()) {
  const s = daylightAt(now)
  sky.top = s.top
  sky.horizon = s.horizon
  sky.water = s.water
  sky.accent = s.accent
  sky.surface = s.surface
  sky.ground = s.ground
  sky.warm = s.warm
  sky.name = s.name
  if (typeof document === 'undefined') return s
  const r = document.documentElement.style
  r.setProperty('--sky-top', rgb(s.top))
  r.setProperty('--sky-horizon', rgb(s.horizon, 0.62))
  r.setProperty('--sky-ground', rgb(mix3(s.top, [3, 4, 9], 0.72)))
  r.setProperty('--sky-warm', s.warm.toFixed(3))

  // ---- the hour, carried into every view ----
  const a = s.accent
  // the raw channels, so any rule can mix its own alpha off the hour's accent
  r.setProperty('--accent-rgb', `${a[0]}, ${a[1]}, ${a[2]}`)
  r.setProperty('--water', rgb(a))
  r.setProperty('--water-soft', rgb(a, 0.14))
  r.setProperty('--accent', rgb(a))
  r.setProperty('--accent-ink', rgb(a))
  r.setProperty('--accent-soft', rgb(a, 0.12))

  // the floor and the glass standing on it
  r.setProperty('--ground', rgb(s.ground))
  r.setProperty('--ground-high', rgb(mix3(s.ground, s.surface, 0.5)))
  r.setProperty('--glass', rgb(s.surface, 0.82))
  r.setProperty('--glass-solid', rgb(mix3(s.ground, s.surface, 0.72)))
  r.setProperty('--sheet', rgb(mix3(s.ground, s.surface, 0.86), 0.94))
  r.setProperty('--cloud', rgb(mix3(s.surface, [255, 255, 255], 0.09)))
  r.setProperty('--cloud-heavy', rgb(s.surface))

  // hairlines and grid pick up the accent so edges belong to the same light
  r.setProperty('--glass-line', rgb(mix3(a, [255, 255, 255], 0.45), 0.17))
  r.setProperty('--line', rgb(mix3(a, [255, 255, 255], 0.45), 0.17))
  r.setProperty('--grid', rgb(a, 0.05))

  // ink sits in the same light without giving up its contrast: near-white
  // stays near-white, and only the quiet greys take the hour's temperature
  r.setProperty('--ink', rgb(mix3([242, 245, 249], a, 0.05)))
  r.setProperty('--ink-soft', rgb(mix3([152, 160, 172], a, 0.18)))
  r.setProperty('--ink-faint', rgb(mix3([86, 93, 104], a, 0.16)))

  // the glass drops in the sky, lit by the same accent
  r.setProperty('--drop-glow', rgb(a, 0.2))
  r.setProperty('--drop-rim', rgb(a, 0.17))
  // the echo a live drop sends out carries the same hour, but has to survive
  // being drawn as a hairline — its own alpha does the fading
  r.setProperty('--drop-echo', rgb(a, 0.7))
  return s
}
