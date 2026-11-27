import { describe, expect, it } from '@jest/globals'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addReleaseSigning } = require('../plugins/withReleaseSigning') as { addReleaseSigning: (gradle: string) => string }

// The part of Expo's app/build.gradle template the plugin edits.
const TEMPLATE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`

describe('release signing', () => {
  it('signs release builds with the keystore from the environment, and debug stays on the debug key', () => {
    const out = addReleaseSigning(TEMPLATE)
    expect(out).toContain("storeFile file(keystore)")
    expect(out).toContain("System.getenv('LERNZEIT_KEYSTORE_PASSWORD')")
    const debug = out.slice(out.indexOf('buildTypes'), out.indexOf('release {', out.indexOf('buildTypes')))
    expect(debug).toContain('signingConfig signingConfigs.debug')
    const release = out.slice(out.indexOf('release {', out.indexOf('buildTypes')))
    expect(release).toContain('signingConfig signingConfigs.release')
    expect(release).not.toContain('signingConfig signingConfigs.debug')
  })

  it('stops a release build that has no keystore, and applies only once', () => {
    const out = addReleaseSigning(TEMPLATE)
    expect(out).toContain('throw new GradleException')
    expect(addReleaseSigning(out)).toBe(out)
  })

  it('fails loudly when the template changed', () => {
    expect(() => addReleaseSigning('android { }')).toThrow(/no longer looks like the Expo template/)
  })
})
