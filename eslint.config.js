import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // The phone app's generated folders: Expo's cache, `expo export` output and native projects.
  { ignores: ['dist', 'dev-dist', 'mobile/.expo', 'mobile/dist', 'mobile/android', 'mobile/ios', 'mobile/expo-env.d.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // The lz command and the scripts run in Node, not the browser.
    files: ['bin/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // The Worker runs on Cloudflare: service-worker globals (fetch, Request, crypto), no DOM.
    files: ['worker/**/*.ts'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    // The shared core must run in the browser, in Node and in React Native: no browser globals.
    files: ['packages/core/**/*.ts'],
    languageOptions: { globals: Object.fromEntries(Object.keys(globals.browser).map((name) => [name, 'off'])) },
  },
  {
    // The phone app runs in React Native: no DOM, plus its own globals. Its screens are loaded by
    // expo-router, so the Vite fast-refresh rule does not apply.
    files: ['mobile/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...Object.fromEntries(Object.keys(globals.browser).map((name) => [name, 'off'])),
        __DEV__: 'readonly',
      },
    },
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['mobile/test/**/*.{ts,tsx}', 'mobile/**/*.test.{ts,tsx}'],
    languageOptions: { globals: globals.jest },
  },
  {
    // Metro and Jest read these as CommonJS in Node.
    files: ['mobile/*.config.js'],
    extends: [js.configs.recommended],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
)
