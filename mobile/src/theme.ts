import { createContext, createElement, useContext, type ReactNode } from 'react'
import { useColorScheme, type TextStyle, type ViewStyle } from 'react-native'

/**
 * The phone's "Lime" look (docs/superpowers/specs/2026-11-26-android-redesign-lime.md): a soft grey
 * canvas, white cards without borders, one lime accent and black pill buttons; light and dark.
 *
 * The Lime names come first. The older names (`sidebar`, `main`, `sage…`, `buttonDark`…) stay as
 * aliases onto the new values, so a screen that is not restyled yet keeps working in the new colours.
 */
export type Palette = {
  /** The page behind the cards. */
  canvas: string
  /** Cards, sheets, the tab bar. */
  card: string
  /** Fields and inner blocks on a card. */
  raised: string
  /** Unselected chips. */
  chip: string
  ink: string
  ink2: string
  muted: string
  line: string
  lineStrong: string
  /** Empty progress bars. */
  track: string
  /** Neutral fills on a track (chart bars): ink in light mode, a mid grey in dark mode. */
  meter: string
  accent: string
  accentSoft: string
  /** Text and icons on `accentSoft`. */
  accentInk: string
  /** Text and icons on `accent`. */
  onAccent: string
  /** The main pill button: black in light mode, lime in dark mode. */
  primary: string
  primaryPressed: string
  onPrimary: string
  /** A dark tile on the light canvas (and a lifted one in dark mode). */
  inverse: string
  onInverse: string
  danger: string
  dangerSoft: string
  /** Text in the danger colour, a little deeper so small text reads. */
  dangerInk: string
  /** Shadow colour for light cards. */
  shadow: string

  /** Older names, mapped onto the Lime values. */
  sidebar: string
  main: string
  soft: string
  field: string
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

type Lime = Omit<Palette, 'sidebar' | 'main' | 'soft' | 'field' | 'buttonDark' | 'buttonDarkPressed' | 'onDark' | 'buttonSoft' | 'sage' | 'sageBorder' | 'sageInk' | 'sageBar' | 'sageDot' | 'redSoft' | 'redInk'>

/** The Lime values plus the old names pointing at them. */
const withAliases = (p: Lime): Palette => ({
  ...p,
  sidebar: p.canvas,
  main: p.card,
  soft: p.raised,
  field: p.raised,
  buttonDark: p.primary,
  buttonDarkPressed: p.primaryPressed,
  onDark: p.onPrimary,
  buttonSoft: p.accentSoft,
  sage: p.accentSoft,
  sageBorder: p.accentSoft,
  sageInk: p.accentInk,
  sageBar: p.accent,
  sageDot: p.accentInk,
  redSoft: p.dangerSoft,
  redInk: p.dangerInk,
})

export const palettes: Record<ColorScheme, Palette> = {
  light: withAliases({
    canvas: '#F2F2F4',
    card: '#FFFFFF',
    raised: '#F6F6F8',
    chip: '#E9E9ED',
    ink: '#16181A',
    ink2: '#3B3F44',
    muted: '#686D75',
    line: '#E7E7EB',
    lineStrong: '#D6D6DC',
    track: '#EDEDF0',
    meter: '#16181A',
    accent: '#D4F24A',
    accentSoft: '#EEF8C8',
    accentInk: '#4E6110',
    onAccent: '#16181A',
    primary: '#16181A',
    primaryPressed: '#2B2E32',
    onPrimary: '#FFFFFF',
    inverse: '#16181A',
    onInverse: '#FFFFFF',
    danger: '#E5484D',
    dangerSoft: '#FDECEC',
    dangerInk: '#C8363B',
    shadow: '#000000',
    onPastel: '#16181A',
    blueSoft: '#E4E9F2',
    blueBorder: '#CBD5E8',
    blueInk: '#34477A',
    blueBar: '#9EADD0',
    blueDot: '#6D7FAE',
    clockRed: '#C8412F',
    neutralChip: '#EFEFF2',
    neutralInk: '#4A4E54',
    der: '#2D5EA8',
    die: '#C2410C',
    das: '#2F7D4F',
    heat: ['#ECECEF', '#E8F6B8', '#D4F24A', '#A9C73A', '#6E8A12'],
    scrim: 'rgba(14, 15, 17, 0.36)',
  }),
  dark: withAliases({
    canvas: '#0E0F11',
    card: '#1A1C1F',
    raised: '#232529',
    chip: '#26292D',
    ink: '#F2F3F5',
    ink2: '#C9CCD1',
    muted: '#8D9299',
    line: '#2A2D31',
    lineStrong: '#3A3D42',
    track: '#2A2D31',
    meter: '#8D9299',
    accent: '#D4F24A',
    accentSoft: '#2A3112',
    accentInk: '#DDF57A',
    onAccent: '#16181A',
    primary: '#D4F24A',
    primaryPressed: '#C3E03C',
    onPrimary: '#16181A',
    inverse: '#2A2D31',
    onInverse: '#F2F3F5',
    danger: '#FF6369',
    dangerSoft: '#3A1D1F',
    dangerInk: '#FF8A8E',
    shadow: '#000000',
    onPastel: '#16181A',
    blueSoft: '#222939',
    blueBorder: '#323D55',
    blueInk: '#B6C3E6',
    blueBar: '#7B8CBA',
    blueDot: '#91A3D4',
    clockRed: '#FF6E5A',
    neutralChip: '#26292D',
    neutralInk: '#C9CCD1',
    der: '#84AAEA',
    die: '#F2925E',
    das: '#7CCB9C',
    heat: ['#1F2124', '#323C16', '#56691E', '#8FAE30', '#D4F24A'],
    scrim: 'rgba(0, 0, 0, 0.6)',
  }),
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
  light: ['#F6E6E1', '#EEF8C8', '#FAF1D6', '#E4E9F2', '#EFE7DE', '#F4E4EA', '#ECECEF'],
  dark: ['#F3E3DE', '#E6F3B8', '#F4EBD0', '#DFE4EE', '#EAE2D9', '#EFDFE5', '#E4E4E8'],
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

/** How far dense chrome (buttons, chips, badges, tiles, counters) grows with large system text; body text is not capped. */
export const CHROME_FONT_SCALE = 1.3

/** Times and numbers line up. */
export const numbers: TextStyle = { fontVariant: ['tabular-nums'] }

/** The Lime type scale; letter spacing in px. Numbers are always tabular. */
export const type = {
  /** Big confident numbers ("2:10 h"). */
  hero: { fontFamily: fonts.semibold, fontSize: 40, lineHeight: 46, letterSpacing: -1.6, ...numbers },
  /** Screen titles ("Guten Morgen"). */
  title: { fontFamily: fonts.semibold, fontSize: 28, lineHeight: 34, letterSpacing: -0.7 },
  /** "Lernzeit" next to the mark. */
  brand: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  /** Figures in tiles ("12 min", "3 days"), shrunk to fit on one line. */
  figure: { fontFamily: fonts.semibold, fontSize: 28, lineHeight: 34, letterSpacing: -0.8, ...numbers },
  /** Stat numbers. */
  stat: { fontFamily: fonts.semibold, fontSize: 40, lineHeight: 46, letterSpacing: -1.6, ...numbers },
  /** Timer countdown ("24:13"). */
  timer: { fontFamily: fonts.semibold, fontSize: 72, lineHeight: 78, letterSpacing: -3, ...numbers },
  /** Card and section titles. */
  section: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 23, letterSpacing: -0.2 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  /** Button labels. */
  button: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  /** Captions, muted labels. */
  small: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  /** Chips and badges. */
  chip: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
} as const satisfies Record<string, TextStyle>

/** Cards 28, inner blocks 20, rows 16, pills. The older names map onto these. */
export const radius = { card: 28, block: 20, row: 16, pill: 999, section: 28, flash: 28, img: 16 } as const

/** A 4 px scale, the 20 px page gutter and 12 px between cards. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  pageX: 20,
  pageTop: 8,
  cardGap: 12,
} as const

/** Pill buttons are 48 px tall (sm 40 with a slop to 48, lg 56), round icon buttons 44, the floating add button 60. */
export const sizes = { button: 52, buttonSmall: 44, icon: 44, fab: 60 } as const

/** Soft depth for light cards only (y 8, blur 24, about 6 % black); dark mode stays flat. */
export type Shadows = { card: ViewStyle; float: ViewStyle; none: ViewStyle }

export function shadow(scheme: ColorScheme): Shadows {
  if (scheme === 'dark') return { card: {}, float: {}, none: {} }
  return {
    card: { boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.06)' },
    float: { boxShadow: '0px 12px 32px rgba(0, 0, 0, 0.12)' },
    none: {},
  }
}

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
  shadow: Shadows
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
  shadow: shadow(scheme),
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
