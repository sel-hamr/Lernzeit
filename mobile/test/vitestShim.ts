/*
 * Core's shared test suites (packages/core/src/*.test-utils.ts) import describe/it/expect from
 * vitest, which the web and the Worker test with. Jest maps `vitest` here (jest.config.js), so the
 * phone runs the same suites with Jest's own functions.
 */
export { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
