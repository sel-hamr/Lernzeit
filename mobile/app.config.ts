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

// Off-white and dark app backgrounds (SPEC §11 `bg-sidebar`), shown behind the splash and the app.
const LIGHT_BACKGROUND = '#F7F7F4'
const DARK_BACKGROUND = '#141816'

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
