import { createContext, createElement, useContext, type ReactNode } from 'react'
import { useColorScheme, type TextStyle } from 'react-native'

/**
 * The Lernzeit look (SPEC.md §11) for the phone: the same tokens as the web's Tailwind theme
 * (src/index.css), light and dark. Names follow the web tokens in camelCase (`ink-2` → `ink2`).
 */
export type Palette = {
  /** App background, top and bottom bars. */
  sidebar: string
  /** Page area and cards. */
  main: string
  soft: string
  /** Select rows, tab groups. */
  field: string
  /** Empty progress bars. */
  track: string
  ink: string
  ink2: string
  muted: string
  line: string
  lineStrong: string
  buttonDark: string
  buttonDarkPressed: string
  /** Text on `buttonDark`. */
  onDark: string
  buttonSoft: string
  /** Text on the card-image pastels, which stay light in both themes. */
  onPastel: string
  sage: string
  sageBorder: string
  sageInk: string
  sageBar: string
  sageDot: string
  blueSoft: string
  blueBorder: string
  blueInk: string
  blueBar: string
  blueDot: string
  redSoft: string
  redInk: string
  clockRed: string
  neutralChip: string
  neutralInk: string
  /** German articles. */
  der: string
  die: string
  das: string
  /** The history heatmap, from no study to a lot. */
  heat: readonly [string, string, string, string, string]
  scrim: string
}

/** One colour set per topic (dot, bar, soft block, border, text), picked by key as on the web. */
export type TopicColors = { dot: string; bar: string; soft: string; border: string; ink: string }
export const TOPIC_COLOR_KEYS = ['sage', 'blue', 'clay', 'sand', 'rose', 'teal', 'lilac', 'stone'] as const
export type TopicColorKey = (typeof TOPIC_COLOR_KEYS)[number]

export type ColorScheme = 'light' | 'dark'

const topic = (dot: string, bar: string, soft: string, border: string, ink: string): TopicColors => ({ dot, bar, soft, border, ink })

export const palettes: Record<ColorScheme, Palette> = {
  light: {
    sidebar: '#F7F7F4',
    main: '#FFFFFF',
    soft: '#FAFAF8',
    field: '#F4F4F0',
    track: '#F1F1EC',
    ink: '#1C211E',
    ink2: '#3A3F3B',
    muted: '#70746F',
    line: '#ECECE6',
    lineStrong: '#DCDCD5',
    buttonDark: '#22302A',
    buttonDarkPressed: '#33463D',
    onDark: '#FFFFFF',
    buttonSoft: '#FAF5DC',
    onPastel: '#1C211E',
    sage: '#E3ECDA',
    sageBorder: '#CFDDC2',
    sageInk: '#3E5A33',
    sageBar: '#8FB27C',
    sageDot: '#5F8F4E',
    blueSoft: '#E4E9F2',
    blueBorder: '#CBD5E8',
    blueInk: '#34477A',
    blueBar: '#9EADD0',
    blueDot: '#6D7FAE',
    redSoft: '#F7E5E0',
    redInk: '#9A3A2A',
    clockRed: '#C8412F',
    neutralChip: '#F1F1EC',
    neutralInk: '#4A4F4B',
    der: '#2D5EA8',
    die: '#B5422E',
    das: '#3E7B3B',
    heat: ['#F1F1EC', '#D6E4CA', '#AFC99C', '#7FA66A', '#4E7A3E'],
    scrim: 'rgba(28, 33, 30, 0.28)',
  },
  dark: {
    sidebar: '#141816',
    main: '#1A1F1C',
    soft: '#171B19',
    field: '#232925',
    track: '#262C28',
    ink: '#E6E9E4',
    ink2: '#C2C7C0',
    muted: '#8F958D',
    line: '#2A302C',
    lineStrong: '#3A423D',
    buttonDark: '#DFE9D5',
    buttonDarkPressed: '#EEF4E8',
    onDark: '#18201B',
    buttonSoft: '#39351F',
    onPastel: '#1C211E',
    sage: '#25321F',
    sageBorder: '#34462B',
    sageInk: '#B4D2A1',
    sageBar: '#6F9C5D',
    sageDot: '#82B36D',
    blueSoft: '#222939',
    blueBorder: '#323D55',
    blueInk: '#B6C3E6',
    blueBar: '#7B8CBA',
    blueDot: '#91A3D4',
    redSoft: '#3B2420',
    redInk: '#EB9C8B',
    clockRed: '#DC5A42',
    neutralChip: '#2A302C',
    neutralInk: '#C2C7C0',
    der: '#84AAEA',
    die: '#EE8A74',
    das: '#85C27F',
    heat: ['#242A26', '#2F4128', '#46623A', '#638C50', '#88BB72'],
    scrim: 'rgba(0, 0, 0, 0.5)',
  },
}

export const topicPalettes: Record<ColorScheme, Record<TopicColorKey, TopicColors>> = {
  light: {
    sage: topic('#5F8F4E', '#8FB27C', '#E3ECDA', '#CFDDC2', '#3E5A33'),
    blue: topic('#6D7FAE', '#9EADD0', '#E4E9F2', '#CBD5E8', '#34477A'),
    clay: topic('#C0674F', '#DDA08E', '#F6E6E1', '#EBCFC6', '#8A3F2C'),
    sand: topic('#C49A3A', '#DEC27E', '#FAF1D6', '#EEDFAF', '#7A5C17'),
    rose: topic('#B0607E', '#D59AB1', '#F4E4EA', '#E8CAD6', '#7E3A55'),
    teal: topic('#4F8C88', '#8DBDB8', '#DFEEEC', '#C2DEDA', '#2F5E5A'),
    lilac: topic('#8A72B0', '#B9A8D3', '#ECE7F4', '#D9CFEA', '#55437A'),
    stone: topic('#8A8579', '#BDB8AC', '#EFE7DE', '#E0D6C9', '#5A5246'),
  },
  dark: {
    sage: topic('#82B36D', '#6F9C5D', '#25321F', '#34462B', '#B4D2A1'),
    blue: topic('#91A3D4', '#7B8CBA', '#222939', '#323D55', '#B6C3E6'),
    clay: topic('#DD8A72', '#B9705C', '#382420', '#4F322B', '#F0B3A2'),
    sand: topic('#DCB55A', '#B4964F', '#352E1B', '#4B4127', '#ECD398'),
    rose: topic('#D384A2', '#AC6F87', '#362229', '#4C303A', '#EFB6CB'),
    teal: topic('#6FB1AC', '#5B8F8A', '#1D302E', '#2B4542', '#A7DAD5'),
    lilac: topic('#A991D0', '#8A76AA', '#2A2438', '#3D3450', '#D2C4EC'),
    stone: topic('#AAA496', '#8A8579', '#2C2925', '#3E3A34', '#D9D2C5'),
  },
}

/** Soft backgrounds behind card images (SPEC §11.6); they stay light in dark mode too. */
export const pastels: Record<ColorScheme, readonly string[]> = {
  light: ['#F6E6E1', '#E3ECDA', '#FAF1D6', '#E4E9F2', '#EFE7DE', '#F4E4EA', '#F1F1EC'],
  dark: ['#F3E3DE', '#DFE8D6', '#F4EBD0', '#DFE4EE', '#EAE2D9', '#EFDFE5', '#E7E7E1'],
}

/**
 * Geist 400/500/600 as loaded in app/_layout.tsx. Android picks a custom font by family name, not by
 * `fontWeight`, so each weight is its own family.
 */
export const fonts = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
} as const

/** Times and numbers line up (SPEC §11.2). */
export const numbers: TextStyle = { fontVariant: ['tabular-nums'] }

/** The type scale from SPEC §11.2; letter spacing in px (em × size), line heights as on the web. */
export const type = {
  /** Page title ("Today"). */
  title: { fontFamily: fonts.semibold, fontSize: 28, lineHeight: 32, letterSpacing: -0.56 },
  /** "Lernzeit" next to the mark. */
  brand: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  /** Big stat numbers ("2:05 h"). */
  stat: { fontFamily: fonts.regular, fontSize: 40, lineHeight: 44, letterSpacing: -1.2, ...numbers },
  /** Timer countdown ("24:13"). */
  timer: { fontFamily: fonts.regular, fontSize: 72, lineHeight: 72, letterSpacing: -2.88, ...numbers },
  /** Card and section titles. */
  section: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 23 },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  /** Small labels. */
  small: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  /** Chips. */
  chip: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
} as const satisfies Record<string, TextStyle>

/** SPEC §11.3: sections 16, flashcards 14, rows 12, images and nav items 10, pills. */
export const radius = { section: 16, flash: 14, row: 12, img: 10, pill: 999 } as const

/** A 4 px scale, plus the phone page measures the web uses (16 px sides, 20 px top, 24 px between cards). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  pageX: 16,
  pageTop: 20,
  cardGap: 24,
} as const

/** Pill buttons are 40 px tall. */
export const sizes = { button: 40 } as const

export type Theme = {
  scheme: ColorScheme
  colors: Palette
  topics: Record<TopicColorKey, TopicColors>
  pastels: readonly string[]
  fonts: typeof fonts
  type: typeof type
  radius: typeof radius
  spacing: typeof spacing
  sizes: typeof sizes
}

const themeFor = (scheme: ColorScheme): Theme => ({
  scheme,
  colors: palettes[scheme],
  topics: topicPalettes[scheme],
  pastels: pastels[scheme],
  fonts,
  type,
  radius,
  spacing,
  sizes,
})

/** Both themes, built once so `useTheme()` returns the same object while the scheme stays. */
export const themes: Record<ColorScheme, Theme> = { light: themeFor('light'), dark: themeFor('dark') }

/** `system` follows the phone's light/dark setting. */
export type ThemePreference = ColorScheme | 'system'

const ThemePreferenceContext = createContext<ThemePreference>('system')

/** Sets the theme for everything below it; without it the app follows the system setting. */
export function ThemeProvider({ preference = 'system', children }: { preference?: ThemePreference; children: ReactNode }) {
  return createElement(ThemePreferenceContext.Provider, { value: preference }, children)
}

/** The current theme: the provider's choice, or the system colour scheme. */
export function useTheme(): Theme {
  const preference = useContext(ThemePreferenceContext)
  const system = useColorScheme()
  return themes[preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference]
}
