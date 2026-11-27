import Constants from 'expo-constants'

/** "Lernzeit 1.0.0 (10000)": the version name and Android's version code, for Settings and bug reports. */
export function versionLabel(version?: string, code?: number): string {
  if (!version) return 'Lernzeit'
  return code ? `Lernzeit ${version} (${code})` : `Lernzeit ${version}`
}

/** This build's version line, from app.config.ts (which reads mobile/package.json). */
export function appVersionLabel(): string {
  return versionLabel(Constants.expoConfig?.version, Constants.expoConfig?.android?.versionCode)
}
