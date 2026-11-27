import Constants from 'expo-constants'
import { ArrowLeft, BookOpen, Clock3, Layers, Target } from 'lucide-react-native'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BackHandler, Image, KeyboardAvoidingView, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import mark from '../../assets/splash-icon.png'
import markDark from '../../assets/splash-icon-dark.png'
import { FadeInUp } from '../motion'
import { useLocalLibrary } from '../store/live'
import { useTheme } from '../theme'
import { Button, Chip, Field, IconButton, Stepper, Tile, ToggleRow } from '../ui'
import { GERMAN_SUMMARY, loadStarterFile, setUpLernzeit, startEmpty, useShouldOfferStarter } from './starter'

const SUGGESTIONS = ['German', 'English', 'Maths', 'Programming', 'Music']
const PAGES = 3

/**
 * The first-launch welcome: shown over the app when this phone and the cloud library are both empty
 * (after the first sync). Three pages that slide, with dots: what Lernzeit is, the topics, and the
 * daily goal with the optional German starter.
 */
export function Welcome() {
  const offered = useShouldOfferStarter()
  if (!offered) return null
  return <WelcomePages />
}

function WelcomePages() {
  const { colors, type, spacing, radius, shadow, scheme } = useTheme()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const library = useLocalLibrary()
  const pager = useRef<Animated.ScrollView>(null)
  const x = useSharedValue(0)
  const [page, setPage] = useState(0)
  const [picked, setPicked] = useState<string[]>(['German'])
  const [custom, setCustom] = useState('')
  const [minutes, setMinutes] = useState(30)
  const [german, setGerman] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const hasGerman = picked.some((p) => p.toLowerCase() === 'german')
  const withGerman = german && hasGerman
  const toggle = (name: string) => setPicked((p) => (p.includes(name) ? p.filter((n) => n !== name) : [...p, name]))
  const addCustom = () => {
    const name = custom.trim()
    if (name && !picked.some((p) => p.toLowerCase() === name.toLowerCase())) setPicked([...picked, name])
    setCustom('')
  }
  const goTo = (to: number) => {
    const next = Math.max(0, Math.min(PAGES - 1, to))
    setPage(next)
    pager.current?.scrollTo({ x: next * width, animated: true })
  }
  const onScroll = useAnimatedScrollHandler((e) => {
    x.value = e.contentOffset.x
  })
  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))
  // Android back steps back a page; on the first page it leaves the app as before.
  useEffect(() => {
    if (page === 0) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setPage(page - 1)
      pager.current?.scrollTo({ x: (page - 1) * width, animated: true })
      return true
    })
    return () => sub.remove()
  }, [page, width])

  const start = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const file = withGerman ? await loadStarterFile(String(Constants.expoConfig?.extra?.apiUrl ?? '')) : undefined
      setUpLernzeit(library, picked.map((name) => ({ name, minutes })), file)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setting up failed.')
      setBusy(false)
    }
  }

  const last = page === PAGES - 1
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas, zIndex: 50 }]} accessibilityViewIsModal>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <View style={[styles.top, { paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.pageX - 4 }]}>
          {page > 0 ? <IconButton icon={ArrowLeft} label="Back" onPress={() => goTo(page - 1)} /> : <View style={styles.spacer} />}
          <Button label="Start empty" variant="ghost" size="sm" disabled={busy} onPress={() => startEmpty(library)} />
        </View>
        <Animated.ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={settle}
          keyboardShouldPersistTaps="handled"
          style={styles.fill}
        >
          <Page width={width}>
            <FadeInUp index={0}>
              <View style={[styles.heroTile, { backgroundColor: colors.accent, borderRadius: radius.card }]}>
                <View style={[styles.markTile, { backgroundColor: colors.card, borderRadius: radius.block }, shadow.card]}>
                  <Image source={scheme === 'dark' ? markDark : mark} style={styles.mark} accessibilityIgnoresInvertColors />
                </View>
              </View>
            </FadeInUp>
            <FadeInUp index={1} style={{ gap: spacing.sm }}>
              <Text style={[type.title, styles.bigTitle, { color: colors.ink }]} accessibilityRole="header">
                Welcome to Lernzeit
              </Text>
              <Text style={[type.body, { color: colors.muted }]}>Pick what you study and a daily goal. You can change both later in Settings.</Text>
            </FadeInUp>
            <FadeInUp index={2} style={{ gap: spacing.sm }}>
              <Point icon={Target} text="A daily goal per topic, and a bar that fills as you study" />
              <Point icon={Clock3} text="A timer that keeps running with the app closed" />
              <Point icon={Layers} text="Flashcards you practise a whole deck at a time" />
            </FadeInUp>
          </Page>

          <Page width={width}>
            <View style={{ gap: spacing.sm }}>
              <Text style={[type.title, { color: colors.ink }]} accessibilityRole="header">
                What do you study?
              </Text>
              <Text style={[type.body, { color: colors.muted }]}>Study time is logged against a topic. Pick one or more.</Text>
            </View>
            <View style={[{ backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl, gap: spacing.lg }, shadow.card]}>
              <View style={[styles.wrap, { gap: spacing.sm }]}>
                {[...SUGGESTIONS, ...picked.filter((p) => !SUGGESTIONS.includes(p))].map((s) => (
                  <Chip key={s} label={s} selected={picked.includes(s)} onPress={() => toggle(s)} />
                ))}
              </View>
              <View style={[styles.row, { gap: spacing.sm }]}>
                <View style={styles.fill}>
                  <Field value={custom} onChangeText={setCustom} onSubmitEditing={addCustom} placeholder="Another topic" accessibilityLabel="Another topic" returnKeyType="done" />
                </View>
                <Button label="Add" variant="soft" onPress={addCustom} style={{ height: 52 }} />
              </View>
            </View>
          </Page>

          <Page width={width}>
            <View style={{ gap: spacing.sm }}>
              <Text style={[type.title, { color: colors.ink }]} accessibilityRole="header">
                Your daily goal
              </Text>
              <Text style={[type.body, { color: colors.muted }]}>{picked.length ? `For each of ${picked.join(', ')}.` : 'Pick a topic first, or start empty.'}</Text>
            </View>
            <View style={[{ backgroundColor: colors.card, borderRadius: radius.card, paddingHorizontal: spacing.xl, paddingVertical: spacing.md }, shadow.card]}>
              <Stepper label="Daily goal per topic" value={minutes} step={15} min={0} max={480} onChange={setMinutes} />
            </View>
            {hasGerman ? (
              <View style={[{ backgroundColor: colors.card, borderRadius: radius.card, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.sm }, shadow.card]}>
                <View style={[styles.row, { gap: spacing.md, paddingTop: spacing.xs }]}>
                  <Tile bg={colors.accentSoft} size={36}>
                    <BookOpen size={18} strokeWidth={1.8} color={colors.accentInk} />
                  </Tile>
                  <Text style={[type.section, { color: colors.ink, flex: 1 }]}>German starter</Text>
                </View>
                <ToggleRow
                  label="Add the German starter"
                  hint={`${GERMAN_SUMMARY.cards} cards in ${GERMAN_SUMMARY.decks} decks, ${GERMAN_SUMMARY.stories} stories, ${GERMAN_SUMMARY.questions} questions and ${GERMAN_SUMMARY.grammar} grammar topics. Downloaded now.`}
                  value={german}
                  onChange={setGerman}
                />
              </View>
            ) : null}
            {error ? (
              <View style={{ backgroundColor: colors.dangerSoft, borderRadius: radius.row, padding: spacing.lg }}>
                <Text style={[type.body, { color: colors.dangerInk }]} accessibilityRole="alert">
                  {error}
                </Text>
              </View>
            ) : null}
          </Page>
        </Animated.ScrollView>

        <View style={[styles.bottom, { paddingHorizontal: spacing.pageX, paddingBottom: insets.bottom + spacing.lg, gap: spacing.lg }]}>
          <View style={[styles.dots, { gap: 6 }]} accessible accessibilityLabel={`Page ${page + 1} of ${PAGES}`}>
            {Array.from({ length: PAGES }, (_, i) => (
              <Dot key={i} index={i} x={x} width={width} />
            ))}
          </View>
          {last ? (
            <Button label={withGerman ? 'Set up and download' : 'Get started'} size="lg" haptic="success" busy={busy} disabled={picked.length === 0 && !withGerman} onPress={() => void start()} />
          ) : (
            <Button label={page === 0 ? 'Let’s start' : 'Next'} size="lg" haptic="tap" disabled={page === 1 && picked.length === 0} onPress={() => goTo(page + 1)} />
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

function Page({ width, children }: { width: number; children: ReactNode }) {
  const { spacing } = useTheme()
  return (
    <ScrollView style={{ width }} contentContainerStyle={{ paddingHorizontal: spacing.pageX, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.xl }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
      {children}
    </ScrollView>
  )
}

function Point({ icon: Icon, text }: { icon: typeof Target; text: string }) {
  const { colors, type, spacing, radius, shadow } = useTheme()
  return (
    <View style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.row, padding: spacing.md, gap: spacing.md }, shadow.card]}>
      <Tile bg={colors.raised} size={36}>
        <Icon size={18} strokeWidth={1.8} color={colors.ink} />
      </Tile>
      <Text style={[type.bodyMedium, { color: colors.ink, flex: 1 }]}>{text}</Text>
    </View>
  )
}

/** A page dot that stretches into a dark pill while its page is in view. */
function Dot({ index, x, width }: { index: number; x: SharedValue<number>; width: number }) {
  const { colors } = useTheme()
  const animated = useAnimatedStyle(() => {
    const at = x.value / Math.max(1, width)
    const near = interpolate(Math.abs(at - index), [0, 1], [1, 0], 'clamp')
    return { width: 8 + near * 16, opacity: 0.45 + near * 0.55 }
  })
  return <Animated.View style={[styles.dot, { backgroundColor: colors.ink }, animated]} />
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spacer: { width: 44, height: 44 },
  heroTile: { height: 200, alignItems: 'center', justifyContent: 'center' },
  markTile: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 60, height: 60 },
  bigTitle: { fontSize: 34, lineHeight: 40, letterSpacing: -1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center' },
  bottom: {},
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: 8 },
  dot: { height: 8, borderRadius: 4 },
})
