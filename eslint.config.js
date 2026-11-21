import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'dev-dist'] },
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
    // The MCP server, the lz command and the scripts run in Node, not the browser.
    files: ['mcp/**/*.ts', 'bin/**/*.ts', 'scripts/**/*.ts'],
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
)
