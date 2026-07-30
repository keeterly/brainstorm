// What to tell someone when it did not work.
//
// The sky put this on screen, in full, above the map: "output failed schema
// validation after repair retry". Every word of that is for me. It tells the
// person holding the phone nothing about what happened, nothing about whether
// it was their fault, and nothing about whether pressing the button again is
// worth a second minute of their life.
//
// The run row keeps the technical reason — which field, what the model sent,
// whether it was cut off — because that is what makes the next one fixable.
// This is the other half: the same failure, said to a person.

/** Reasons that are already addressed to the user and should pass through. */
const ALREADY_HUMAN = [/^sign in/i, /^daily ai limit/i, /^not signed in/i, /^cancelled$/i, /^offline$/i]

export function whyItFailed(status: string | null, error: string | null): string {
  const raw = (error ?? '').trim()

  for (const p of ALREADY_HUMAN) if (p.test(raw)) return raw

  // Running out of room is a different problem from being wrong, and the one
  // thing that actually helps is knowing the ask was too big.
  if (/ran out of room|max_tokens|too long/i.test(raw)) {
    return 'it had more to say than would fit — try asking for a narrower piece of it'
  }
  if (/failed validation|schema/i.test(raw) || status === 'invalid_output') {
    return 'it came back in a shape the app could not read — worth one more go'
  }
  if (/did not emit/i.test(raw)) {
    return 'it went quiet before answering — worth one more go'
  }
  if (/rate|429|overloaded|529/i.test(raw)) {
    return 'the thinking engine is busy right now — give it a minute'
  }
  if (/timeout|timed out|never came back/i.test(raw)) {
    return 'it did not come back in time'
  }
  if (/network|fetch|failed to fetch/i.test(raw)) {
    return 'could not reach the thinking engine'
  }

  // Anything short and sentence-shaped is more useful than a euphemism.
  if (raw && raw.length <= 70 && !/[{}[\]<>]/.test(raw)) return raw.toLowerCase()
  return 'the thinking engine could not finish that one'
}
