// The world is level, and your phone is the window you hold up to it.
//
// Turn the phone and the world does not turn with it: the water stays flat to
// gravity and every drop hangs the way a drop hangs, with its highlight on top
// and its words the right way up. It is the one place where the metaphor stops
// being a picture of a world and starts behaving like one.
//
// Two amounts come out of here, because they want different things:
//   uprightAngle() — the full counter-rotation. Drops take this, so they are
//     level however you hold the phone. They are circles, so nothing clips.
//   worldTilt()    — the same angle held to a gentle range. The sky and the
//     ocean take this: a rectangle turned much past twenty degrees shows its
//     corners, and no amount of magic is worth an empty triangle.
//
// iOS will not hand over the sensor without asking, and will only ask inside a
// real gesture — so this arms itself on the first touch and never nags. If the
// answer is no, or there is no sensor, the angle stays at zero and no caller
// has to know the difference.

const MAX_WORLD_TILT = 20

let angle = 0 // where the world is now, eased
let target = 0 // where the device says it should be
let running = false
let asked = false

/** Full counter-rotation, in degrees. */
export function uprightAngle() {
  return angle
}

/** The same, held to a range the rectangular views can afford. */
export function worldTilt() {
  return Math.max(-MAX_WORLD_TILT, Math.min(MAX_WORLD_TILT, angle))
}

/** Ease one frame toward the device. Called by whoever is drawing, so every
 *  surface in the app turns together on the same clock. */
export function stepUpright(reduced = false) {
  if (reduced) return angle
  let d = target - angle
  // the short way round, so passing through ±180 does not spin the world
  while (d > 180) d -= 360
  while (d < -180) d += 360
  angle += d * 0.1
  if (angle > 180) angle -= 360
  if (angle < -180) angle += 360
  return angle
}

/**
 * Which way is down, from the device's own tilt.
 *
 * beta and gamma describe how the phone is held; projecting gravity onto the
 * plane of the screen turns them into one number — the angle the content has
 * to turn through to stand back up.
 */
export function rollFrom(beta: number, gamma: number): number | null {
  const b = (beta * Math.PI) / 180
  const g = (gamma * Math.PI) / 180
  const gx = -Math.cos(b) * Math.sin(g)
  const gy = Math.sin(b)
  // face-up on a table there is no down to speak of, and the angle thrashes
  // between readings. Better to hold the last good one than chase the noise.
  if (Math.hypot(gx, gy) < 0.17) return null
  return (Math.atan2(gx, gy) * 180) / Math.PI
}

function onOrientation(e: DeviceOrientationEvent) {
  if (e.beta == null || e.gamma == null) return
  const r = rollFrom(e.beta, e.gamma)
  if (r !== null) target = r
}

function start() {
  if (running) return
  running = true
  addEventListener('deviceorientation', onOrientation, true)
}

type Permissioned = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<PermissionState> }

/** Arm the sensor. Safe to call on every touch — it asks at most once, and
 *  only from inside a gesture, which is the only time iOS will allow it. */
export function armUpright() {
  if (asked || typeof DeviceOrientationEvent === 'undefined') return
  asked = true
  const req = (DeviceOrientationEvent as Permissioned).requestPermission
  if (typeof req !== 'function') {
    start()
    return
  }
  void req()
    .then((state) => {
      if (state === 'granted') start()
    })
    .catch(() => {
      /* declined, or not allowed here — the world simply stays as it was */
    })
}

/** Test seam: drive the angle directly and read where the world settles. */
export function __setUprightTarget(deg: number) {
  target = deg
}
export function __resetUpright() {
  angle = 0
  target = 0
}
