import { renderRouter, screen } from 'expo-router/testing-library'
import { useColorScheme } from 'react-native'
import RootLayout from '../app/_layout'
import Home from '../app/index'
import appConfig, { DEFAULT_API_URL, versionCode } from '../app.config'
import pkg from '../package.json'
import { palettes, themes } from '../src/theme'

describe('the app shell', () => {
  it('opens on the home screen through the root layout', async () => {
    await renderRouter({ _layout: RootLayout, index: Home }, { initialUrl: '/' })
    expect(await screen.findByText('Lernzeit')).toHaveStyle({ color: palettes.light.ink })
  })
})

describe('theme', () => {
  it('has the SPEC §11 tokens in light and dark', () => {
    expect(palettes.light).toMatchObject({ sidebar: '#F7F7F4', main: '#FFFFFF', ink: '#1C211E', buttonDark: '#22302A', sage: '#E3ECDA' })
    expect(palettes.dark).toMatchObject({ sidebar: '#141816', main: '#1A1F1C', ink: '#E6E9E4', buttonDark: '#DFE9D5' })
    expect(Object.keys(palettes.dark).sort()).toEqual(Object.keys(palettes.light).sort())
    expect(themes.dark.type.stat.fontVariant).toEqual(['tabular-nums'])
  })

  it('follows the system colour scheme', async () => {
    // The React Native Jest preset mocks useColorScheme, answering 'light'.
    jest.mocked(useColorScheme).mockReturnValue('dark')
    try {
      await renderRouter({ _layout: RootLayout, index: Home }, { initialUrl: '/' })
      expect(await screen.findByText('Lernzeit')).toHaveStyle({ color: palettes.dark.ink })
    } finally {
      jest.mocked(useColorScheme).mockReturnValue('light')
    }
  })
})

describe('app config', () => {
  const config = appConfig({ config: {} } as Parameters<typeof appConfig>[0])

  it('names the Android app and takes its version from package.json', () => {
    expect(config).toMatchObject({ name: 'Lernzeit', slug: 'lernzeit', scheme: 'lernzeit', version: pkg.version })
    expect(config.android).toMatchObject({ package: 'com.selhamr.lernzeit', versionCode: versionCode(pkg.version) })
    expect(config.extra?.apiUrl).toBe(process.env.LERNZEIT_API_URL || DEFAULT_API_URL)
  })

  it('turns the version into a growing version code', () => {
    expect(versionCode('1.0.0')).toBe(10000)
    expect(versionCode('1.2.3')).toBe(10203)
    expect(versionCode('2.0.0')).toBeGreaterThan(versionCode('1.99.99'))
    expect(() => versionCode('1.2')).toThrow()
    expect(() => versionCode('1.100.0')).toThrow()
  })
})
