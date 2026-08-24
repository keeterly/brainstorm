// The screenshot walk, kept out of the suite.
//
// `e2e/shots.walk.ts` asserts almost nothing — it walks the loop and
// photographs each stop, so a change to how the app looks can be looked at
// rather than described. That is worth having and it is not worth three
// minutes of every CI run, so it is named `.walk.ts` rather than `.spec.ts`
// (which is what the e2e config globs) and this points at it directly.
//
// `npm run shots` is the whole interface. Output lands in e2e/shots/, which is
// gitignored — regenerate it, do not commit it.
import { defineConfig, mergeConfig } from 'vitest/config'
import e2e from './vitest.e2e.config'

export default mergeConfig(
  e2e,
  defineConfig({ test: { include: ['e2e/shots.walk.ts'] } }),
)
