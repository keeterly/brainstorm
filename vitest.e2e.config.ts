// The slow suite, kept away from the fast one.
//
// `npm test` is run constantly and has to stay in seconds; this builds the app
// and opens a browser, so it is its own command and its own config. Same
// runner, though — a second test framework alongside vitest would be one more
// thing to learn for no gain.
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    // a real browser is driven from node; jsdom has no part in this
    environment: 'node',
    globals: true,
    include: ['e2e/**/*.spec.ts'],
    // one browser at a time: these are journeys through one app, and running
    // four of them at once on a shared runner is how a suite starts failing
    // for reasons that have nothing to do with the app
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
})
