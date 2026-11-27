/*
 * Signs release builds with the owner's keystore. The keystore and its passwords live outside the
 * repo; Gradle reads them from the environment at build time:
 *   LERNZEIT_KEYSTORE, LERNZEIT_KEYSTORE_PASSWORD, LERNZEIT_KEY_ALIAS, LERNZEIT_KEY_PASSWORD
 * Without them a release build stops with a clear error instead of quietly using the debug key.
 * EAS Build (EAS_BUILD set) signs with the keystore it is given and is left alone.
 * (`mobile/scripts/build-apk.mjs` loads them from ~/.lernzeit-android/keystore.env.)
 */
const { withAppBuildGradle } = require('expo/config-plugins')

const MARK = '// lernzeit-release-signing'

const RELEASE_CONFIG = `
        release { ${MARK}
            def keystore = System.getenv('LERNZEIT_KEYSTORE')
            if (keystore) {
                storeFile file(keystore)
                storePassword System.getenv('LERNZEIT_KEYSTORE_PASSWORD')
                keyAlias System.getenv('LERNZEIT_KEY_ALIAS')
                keyPassword System.getenv('LERNZEIT_KEY_PASSWORD')
            }
        }`

const GUARD = `
gradle.taskGraph.whenReady { graph -> ${MARK}
    def releasing = graph.allTasks.any { it.name.toLowerCase().contains('release') && (it.name.startsWith('assemble') || it.name.startsWith('bundle')) }
    if (releasing && !System.getenv('LERNZEIT_KEYSTORE') && !System.getenv('EAS_BUILD')) {
        throw new GradleException('Release builds need LERNZEIT_KEYSTORE and its passwords (see docs/android.md).')
    }
}
`

function addReleaseSigning(gradle) {
  if (gradle.includes(MARK)) return gradle
  // 1. A release signing config next to the template's debug one.
  const withConfig = gradle.replace(/signingConfigs\s*\{/, (m) => `${m}${RELEASE_CONFIG}`)
  // 2. The release build type uses it (the template points it at the debug key).
  const withType = withConfig.replace(/(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/, '$1signingConfig signingConfigs.release')
  if (withConfig === gradle || withType === withConfig) {
    throw new Error('withReleaseSigning: app/build.gradle no longer looks like the Expo template; update the plugin.')
  }
  return withType + GUARD
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = addReleaseSigning(cfg.modResults.contents)
    return cfg
  })
}

module.exports.addReleaseSigning = addReleaseSigning
