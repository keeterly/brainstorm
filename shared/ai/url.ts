import { z } from 'zod'

/**
 * A link the app is willing to hand to the operating system.
 *
 * Three actions — `answer`, `deepen`, `draft` — run with web search on, so
 * their `sources` come from pages nobody here has read. That output was typed
 * `z.string().max(600)`: no scheme, no shape, nothing. `Answered.tsx` rendered
 * it straight into `href`, and React does not sanitize `javascript:` in a
 * production build. A hostile page in a search result could therefore get
 * script running on this origin, with the Supabase session sitting right there.
 *
 * An allowlist rather than a blocklist, because the blocklist is unwinnable:
 * `javascript:` has a dozen spellings once you allow tabs, newlines, control
 * characters and entity escapes, and `data:` and `blob:` and `vbscript:` are
 * all their own problem. Only a plain http(s) URL with no whitespace in it
 * gets through, which is all a citation has ever been.
 */
export function isWebUrl(u: unknown): u is string {
  return typeof u === 'string' && /^https?:\/\/\S+$/i.test(u.trim())
}

/**
 * The `sources` array every research action returns.
 *
 * It **drops** what it does not like rather than refusing the whole output.
 * Ninety seconds of research should not be thrown away over one malformed
 * footnote, and a repair retry — re-asking with a longer prompt — is a poor
 * answer to a link the model was never going to fix. What is left is the
 * citations that are real.
 */
export const sourceList = (max: number, titleMax = 180, urlMax = 600) =>
  z
    .array(z.object({ title: z.string().max(titleMax), url: z.string().max(urlMax) }))
    .max(max)
    .transform((rows) => rows.filter((r) => isWebUrl(r.url)))
