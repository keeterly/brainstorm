import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rippleAt, SPLASH, TOUCH, WAKE } from './ripple'

function calm(reduce = false) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: reduce, addEventListener() {}, removeEventListener() {} }),
  )
}

const rings = () => [...document.querySelectorAll<SVGPathElement>('.ripple-echo path')]
const box = () => document.querySelector('.ripple-echo') as SVGSVGElement | null

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = ''
  calm()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the ring a touch leaves', () => {
  it('is not a circle', () => {
    // the whole point. A compass circle is the one shape nothing else in this
    // world has, and next to the sky's own echoes it reads as a different app
    rippleAt(200, 400, TOUCH)
    const d = rings()[0].getAttribute('d') as string
    expect(d).toContain('C')
    // every point sits at a different distance from the centre — an ellipse or
    // a circle drawn as a spline would not
    const far = [...d.matchAll(/([-\d.]+) ([-\d.]+)(?:,|$)/g)]
      .map(([, x, y]) => Math.hypot(Number(x), Number(y)))
      .filter((r) => r > 1)
    expect(Math.max(...far) - Math.min(...far)).toBeGreaterThan(0.5)
  })

  it('grows from where the finger was, not from the corner of a box', () => {
    rippleAt(200, 400, TOUCH)
    const svg = box() as SVGSVGElement
    // the viewBox is centred on 0,0 and the box is hung so that 0,0 lands on
    // the touch: half its width to the left, half its height above
    const [minX, minY, w, h] = (svg.getAttribute('viewBox') as string).split(' ').map(Number)
    expect(minX).toBe(-w / 2)
    expect(minY).toBe(-h / 2)
    expect(parseFloat(svg.style.left) + w / 2).toBeCloseTo(200, 1)
    expect(parseFloat(svg.style.top) + h / 2).toBeCloseTo(400, 1)
  })

  it('leaves room for the wobble, so no ring is clipped into a rectangle', () => {
    rippleAt(0, 0, TOUCH)
    const widest = Math.max(...TOUCH.rings.map(([d]) => d))
    expect(parseFloat((box() as SVGSVGElement).style.width)).toBeGreaterThan(widest)
  })

  it('is two rings slightly apart, so it reads as a disturbance and not a shape', () => {
    rippleAt(10, 10, TOUCH)
    expect(rings()).toHaveLength(2)
    expect(rings()[1].style.getPropertyValue('--wait')).not.toBe(rings()[0].style.getPropertyValue('--wait'))
  })

  it('ripples the same way twice in the same place, and differently elsewhere', () => {
    // the rule the rest of this world's geometry follows: same seed, same
    // imperfection, every time
    rippleAt(120, 300, TOUCH)
    const a = rings()[0].getAttribute('d')
    document.body.innerHTML = ''
    rippleAt(120, 300, TOUCH)
    const again = rings()[0].getAttribute('d')
    document.body.innerHTML = ''
    rippleAt(121, 300, TOUCH)
    const elsewhere = rings()[0].getAttribute('d')
    expect(again).toBe(a)
    expect(elsewhere).not.toBe(a)
  })

  it('clears itself up once the last ring is out', () => {
    rippleAt(10, 10, WAKE)
    expect(box()).toBeTruthy()
    vi.advanceTimersByTime(330 + 1300 + 200)
    expect(box()).toBeNull()
  })

  it('says nothing at all when motion is not wanted', () => {
    calm(true)
    expect(rippleAt(10, 10, TOUCH)).toBeNull()
    expect(box()).toBeNull()
  })
})

describe('the wake a press-and-hold leaves', () => {
  it('is longer and softer than a tap, and keeps going', () => {
    // it runs ahead of a page that takes the best part of a second to arrive,
    // so a tap's ring would be gone before the paper caught up with it
    rippleAt(10, 10, WAKE)
    expect(rings()).toHaveLength(4)
    expect(WAKE.life as number).toBeGreaterThan(TOUCH.life as number)
    expect(rings()[0].style.getPropertyValue('--lit')).toBe(String(WAKE.lit))
  })

  it('fades each ring behind the one in front of it', () => {
    rippleAt(10, 10, WAKE)
    const lit = rings().map((p) => Number(p.style.getPropertyValue('--lit')))
    expect(lit).toEqual([...lit].sort((a, b) => b - a))
  })

  it('wobbles further out the further it gets, the way a wave loses its edge', () => {
    rippleAt(0, 0, WAKE)
    const spread = (p: Element) => {
      const r = [...(p.getAttribute('d') as string).matchAll(/([-\d.]+) ([-\d.]+)(?:,|$)/g)].map(([, x, y]) =>
        Math.hypot(Number(x), Number(y)),
      )
      return (Math.max(...r) - Math.min(...r)) / Math.max(...r)
    }
    expect(spread(rings()[3])).toBeGreaterThan(spread(rings()[0]))
  })
})

describe('a splash', () => {
  it('is squashed, because you are looking at the surface from just above it', () => {
    rippleAt(50, 60, SPLASH)
    expect((box() as SVGSVGElement).style.transform).toBe(`scaleY(${SPLASH.flatten})`)
  })

  it('stays centred on the point it landed on, squashed or not', () => {
    // the old one squashed about the box's centre but was hung by a quarter of
    // its height, so the ring sat below the splash
    rippleAt(50, 60, SPLASH)
    const svg = box() as SVGSVGElement
    expect(parseFloat(svg.style.top) + parseFloat(svg.style.height) / 2).toBeCloseTo(60, 1)
  })
})
