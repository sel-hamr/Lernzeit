import type { ConfigContext, ExpoConfig } from 'expo/config'
import pkg from './package.json'

/** The cloud the app signs in to; `LERNZEIT_API_URL` points a build at another one (a local Worker, say). */
export const DEFAULT_API_URL = 'https://lernzeit.selhamr9.workers.dev'

/** Android needs a growing whole number per release: 1.2.3 becomes 10203. */
export function versionCode(version: string): number {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`Version "${version}" in mobile/package.json is not major.minor.patch`)
  const [major, minor, patch] = match.slice(1).map(Number)
  if (minor > 99 || patch > 99) throw new Error(`Version "${version}": minor and patch must be below 100`)
  return major * 10000 + minor * 100 + patch
}

// The Lime canvas (src/theme.ts `canvas`), light and dark: behind the splash, the app and the
// adaptive icon, so nothing changes colour between the splash and the first screen.
const LIGHT_BACKGROUND = '#F2F2F4'
const DARK_BACKGROUND = '#0E0F11'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Lernzeit',
  slug: 'lernzeit',
  scheme: 'lernzeit',
  version: pkg.version,
  platforms: ['android'],
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  backgroundColor: LIGHT_BACKGROUND,
  // Edge-to-edge is always on from SDK 54 (Android 16 makes it mandatory), so there is no
  // `android.edgeToEdgeEnabled` to set: prebuild warns when the key is present. The status bar style
  // follows the in-app theme (app/_layout.tsx) and the window background follows the canvas.
  android: {
    package: 'com.selhamr.lernzeit',
    versionCode: versionCode(pkg.version),
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      monochromeImage: './assets/adaptive-icon-monochrome.png',
      backgroundColor: LIGHT_BACKGROUND,
    },
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-status-bar',
    'expo-sqlite',
    'expo-secure-store',
    'expo-sharing',
    'expo-notifications',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 88,
        backgroundColor: LIGHT_BACKGROUND,
        dark: { image: './assets/splash-icon.png', backgroundColor: DARK_BACKGROUND },
      },
    ],
  ],
  experiments: {
    // Resolve react, react-native and native modules to this app's copies, never a second one
    // elsewhere in the monorepo. Expo turns this on for workspaces anyway; it is set to say so.
    autolinkingModuleResolution: true,
  },
  extra: {
    apiUrl: process.env.LERNZEIT_API_URL || DEFAULT_API_URL,
  },
})
