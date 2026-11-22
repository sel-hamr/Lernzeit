/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo/android',
  setupFiles: ['<rootDir>/test/setup.ts'],
  // Core's shared test suites import from vitest; here they run on Jest's own functions.
  moduleNameMapper: { '^vitest$': '<rootDir>/test/vitestShim.ts' },
}
