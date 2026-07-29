// The echo this world sends out when something is live or something is
// touched. Joy Division rings: not clean circles but wobbled closed curves,
// stacked in layers that never quite line up. Each ring's wobble is fixed by
// its seed, so it keeps its shape as it travels outward rather than boiling.
//
// Shared by the sky and by the tabs, so a drop and a tab ring the same way.

function closedSpline(pts: [number, number][]): string {
  const n = pts.length
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d + ' Z'
}

export function echoRing(cx: number, cy: number, r: number, seed: number, wob: number): string {
  const N = 26
  const s1 = seed * 1.7
  const s2 = seed * 3.1 + 1.2
  const s3 = seed * 5.3 + 2.4
  const pts: [number, number][] = []
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2
    // integer harmonics only, so the ring closes on itself
    const w = 0.52 * Math.sin(3 * a + s1) + 0.31 * Math.sin(5 * a + s2) + 0.17 * Math.sin(8 * a + s3)
    const rr = r * (1 + wob * w)
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
  }
  return closedSpline(pts)
}

function noise(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return (n: number) => {
    const x = Math.sin(h * 0.0001 + n * 12.9898) * 43758.5453
    return x - Math.floor(x)
  }
}

/** A deterministic asymmetric border-radius, so no two pieces of this world
 *  are a true circle. Same seed, same imperfection, every time. */
export function wabiRadius(seed: string, spread = 4): string {
  const v = noise(seed)
  const p = (n: number) => (50 - spread / 2 + v(n) * spread).toFixed(1)
  return `${p(1)}% ${p(2)}% ${p(3)}% ${p(4)}% / ${p(5)}% ${p(6)}% ${p(7)}% ${p(8)}%`
}

/** The same for a capsule: corners near `r`, none of them quite equal, so the
 *  glass reads as hand-blown rather than moulded. */
export function wabiPill(seed: string, r: number, spread = 5): string {
  const v = noise(seed)
  const p = (n: number) => (r - spread / 2 + v(n) * spread).toFixed(1)
  return `${p(1)}px ${p(2)}px ${p(3)}px ${p(4)}px / ${p(5)}px ${p(6)}px ${p(7)}px ${p(8)}px`
}
