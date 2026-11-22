// Metro for the npm-workspace monorepo (https://docs.expo.dev/guides/monorepos/).
const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

// Expo watches the root node_modules and every workspace. The app needs only its own folder (always
// watched), the hoisted packages and the shared core, which `@lernzeit/core/*` resolves to as
// TypeScript source through its `exports`. The web app (root src/) and the Worker are not watched,
// so an import of them fails the bundle instead of shipping them.
config.watchFolders = [path.join(workspaceRoot, 'node_modules'), path.join(workspaceRoot, 'packages', 'core')]

module.exports = config
