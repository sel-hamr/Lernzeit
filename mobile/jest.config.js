/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo/android',
  setupFiles: ['<rootDir>/test/setup.ts'],
  moduleNameMapper: {
    // Core's shared test suites import from vitest; here they run on Jest's own functions.
    '^vitest$': '<rootDir>/test/vitestShim.ts',
    // The icon package's React Native entry is an ES module Jest does not load; its CommonJS build (the "main" one) has the same icons.
    '^lucide-react-native$': require.resolve('lucide-react-native'),
  },
}
