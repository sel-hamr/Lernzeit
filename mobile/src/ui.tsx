/*
 * The shared pieces of the Lime look: pill buttons, chips, fields, option rows, the spring bottom
 * sheet, switches, white cards, grouped lists, empty states and badges. No emoji in the chrome.
 */
import { Check, ChevronDown, ChevronRight, Minus, Plus, type LucideIcon } from 'lucide-react-native'
import { Children, Fragment, isValidElement, useEffect, useState, type ReactNode } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable as RNPressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { haptics, Pressable, springs, timings, type HapticKind } from './motion'
import { useTheme } from './theme'

export type ButtonVariant = 'primary' | 'accent' | 'soft' | 'ghost' | 'danger' | 'outline'

/** A pill button: black (lime in dark mode), lime, soft grey, plain, or danger. `outline` is the soft one. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled,
  busy,
  style,
  haptic,
  testID,
}: {
  label: string
  onPress: () => void
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
  disabled?: boolean
  busy?: boolean
  style?: StyleProp<ViewStyle>
  haptic?: HapticKind
  testID?: string
}) {
  const { colors, type, spacing, radius } = useTheme()
  const tone = {
    primary: { bg: colors.primary, fg: colors.onPrimary },
    accent: { bg: colors.accent, fg: colors.onAccent },
    soft: { bg: colors.chip, fg: colors.ink },
    outline: { bg: colors.chip, fg: colors.ink },
    ghost: { bg: 'transparent', fg: colors.ink },
    danger: { bg: colors.dangerSoft, fg: colors.dangerInk },
  }[variant]
  const height = size === 'lg' ? 56 : size === 'sm' ? 40 : 48
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      haptic={haptic}
      disabled={disabled || busy}
      hitSlop={size === 'sm' ? 4 : 0}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      style={[
        styles.button,
        { height, borderRadius: radius.pill, paddingHorizontal: size === 'sm' ? spacing.lg : spacing.xl, gap: spacing.sm, backgroundColor: tone.bg, opacity: disabled ? 0.4 : 1 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={tone.fg} /> : icon}
      <Text style={[size === 'sm' ? type.small : type.button, { color: tone.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

/** A round 44 px button with one icon (Search, Menu, Close…), white on the canvas by default. */
export function IconButton({
  icon: Icon,
  label,
  onPress,
  variant = 'card',
  size = 44,
  iconSize,
  badge,
  disabled,
  haptic,
  selected,
  testID,
}: {
  icon: LucideIcon
  label: string
  onPress: () => void
  variant?: 'card' | 'raised' | 'primary' | 'accent' | 'ghost'
  size?: number
  iconSize?: number
  /** A small dot in this colour on the corner. */
  badge?: string
  disabled?: boolean
  haptic?: HapticKind
  selected?: boolean
  testID?: string
}) {
  const { colors, shadow } = useTheme()
  const tone = {
    card: { bg: colors.card, fg: colors.ink },
    raised: { bg: colors.raised, fg: colors.ink },
    primary: { bg: colors.primary, fg: colors.onPrimary },
    accent: { bg: colors.accent, fg: colors.onAccent },
    ghost: { bg: 'transparent', fg: colors.ink2 },
  }[variant]
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      haptic={haptic}
      disabled={disabled}
      hitSlop={Math.max(0, (44 - size) / 2)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? { disabled: !!disabled } : { disabled: !!disabled, selected }}
      scaleTo={0.92}
      style={[{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: tone.bg, opacity: disabled ? 0.4 : 1 }, variant === 'card' && shadow.card]}
    >
      <Icon size={iconSize ?? Math.round(size * 0.43)} strokeWidth={1.8} color={tone.fg} />
      {badge ? <View style={[styles.badgeDot, { backgroundColor: badge, borderColor: tone.bg === 'transparent' ? colors.canvas : tone.bg }]} /> : null}
    </Pressable>
  )
}

/** A pill to pick or filter: black when selected, soft grey when not. */
export function Chip({ label, selected, onPress, color, icon, testID }: { label: string; selected?: boolean; onPress?: () => void; color?: string; icon?: ReactNode; testID?: string }) {
  const { colors, type, spacing, radius } = useTheme()
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      haptic={onPress ? 'select' : undefined}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      style={[styles.chip, { borderRadius: radius.pill, paddingHorizontal: spacing.md + 2, backgroundColor: selected ? colors.primary : colors.chip }]}
    >
      {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      {icon}
      <Text style={[type.small, { color: selected ? colors.onPrimary : colors.ink2 }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

/** A small pill with a word or number ("Done", "12"). */
export function Badge({ label, tone = 'accent', icon }: { label: string; tone?: 'accent' | 'neutral' | 'danger' | 'inverse' | 'lime'; icon?: ReactNode }) {
  const { colors, type, radius } = useTheme()
  const t = {
    accent: { bg: colors.accentSoft, fg: colors.accentInk },
    lime: { bg: colors.accent, fg: colors.onAccent },
    neutral: { bg: colors.chip, fg: colors.ink2 },
    danger: { bg: colors.dangerSoft, fg: colors.dangerInk },
    inverse: { bg: colors.inverse, fg: colors.onInverse },
  }[tone]
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderRadius: radius.pill }]}>
      {icon}
      <Text style={[type.chip, { color: t.fg, fontFamily: 'Geist_600SemiBold' }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

/** A text field: its label above, a soft rounded box that gets a dark edge while focused. */
export function Field({ label, onCanvas, ...props }: TextInputProps & { label?: string; onCanvas?: boolean }) {
  const { colors, type, spacing, radius } = useTheme()
  const [focused, setFocused] = useState(false)
  return (
    <View style={{ gap: spacing.xs + 2 }}>
      {label ? <Text style={[type.small, { color: colors.muted, paddingHorizontal: 4 }]}>{label}</Text> : null}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        selectionColor={colors.ink}
        cursorColor={colors.ink}
        {...props}
        onFocus={(e) => {
          setFocused(true)
          props.onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          props.onBlur?.(e)
        }}
        style={[
          type.body,
          styles.input,
          { color: colors.ink, backgroundColor: onCanvas ? colors.card : colors.raised, borderColor: focused ? colors.ink : 'transparent', borderRadius: radius.row, paddingHorizontal: spacing.lg },
          props.multiline && styles.multiline,
          props.style,
        ]}
      />
    </View>
  )
}

/** A labelled row that opens a sheet of choices, like the web's SelectRow. */
export function SelectRow<T extends string>({
  label,
  value,
  display,
  options,
  onChange,
  disabled,
  inline,
}: {
  label: string
  value: T
  display?: string
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  disabled?: boolean
  /** A plain row for a grouped list: the label on the left, the value and a chevron on the right. */
  inline?: boolean
}) {
  const { colors, type, spacing, radius } = useTheme()
  const [open, setOpen] = useState(false)
  const shown = display ?? options.find((o) => o.value === value)?.label ?? value
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        scaleTo={inline ? 0.98 : undefined}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown}`}
        style={[styles.selectRow, !inline && { backgroundColor: colors.raised, borderRadius: radius.row, paddingHorizontal: spacing.lg }, { opacity: disabled ? 0.4 : 1 }]}
      >
        <Text style={inline ? [type.bodyMedium, { color: colors.ink }] : [type.small, { color: colors.muted }]}>{label}</Text>
        <View style={styles.selectValue}>
          <Text style={[inline ? type.body : type.bodyMedium, { color: inline ? colors.muted : colors.ink, flexShrink: 1 }]} numberOfLines={1}>
            {shown}
          </Text>
          {inline ? <ChevronRight size={18} strokeWidth={1.8} color={colors.muted} /> : <ChevronDown size={16} strokeWidth={1.8} color={colors.muted} />}
        </View>
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        {options.map((o) => (
          <OptionRow
            key={o.value}
            label={o.label}
            selected={o.value === value}
            onPress={() => {
              setOpen(false)
              onChange(o.value)
            }}
          />
        ))}
      </Sheet>
    </>
  )
}

/** One choice in a sheet: a large row with a check on the chosen one. */
export function OptionRow({ label, detail, selected, onPress, icon }: { label: string; detail?: string; selected?: boolean; onPress: () => void; icon?: ReactNode }) {
  const { colors, type, spacing, radius } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      haptic="select"
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityState={{ selected: !!selected }}
      style={[styles.option, { paddingHorizontal: spacing.lg, gap: spacing.md, backgroundColor: selected ? colors.raised : 'transparent', borderRadius: radius.row }]}
    >
      {icon}
      <Text style={[selected ? type.bodyMedium : type.body, { color: colors.ink, flex: 1 }]} numberOfLines={2}>
        {label}
      </Text>
      {detail ? <Text style={[type.small, { color: colors.muted }]}>{detail}</Text> : null}
      {selected ? <Check size={18} strokeWidth={2.2} color={colors.ink} /> : null}
    </Pressable>
  )
}

/**
 * A bottom sheet on a dimmed backdrop. It slides up on a spring, can be dragged down by its top to
 * close, and closes on Android back and on a tap outside. Fields in it stay above the keyboard.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  testID,
  closeLabel = 'Close',
  footer,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children?: ReactNode
  testID?: string
  /** The backdrop's label for screen readers. */
  closeLabel?: string
  /** Pinned under the scrolling content (a Save button). */
  footer?: ReactNode
}) {
  const { colors, type, spacing, radius, shadow } = useTheme()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  const { height: screen } = useWindowDimensions()
  const offset = useSharedValue(screen)

  const drag = usePanGesture({
    onUpdate: (e) => {
      'worklet'
      // Down follows the finger; up gives a little, like a rubber band.
      offset.value = e.translationY > 0 ? e.translationY : e.translationY * 0.15
    },
    onDeactivate: (e) => {
      'worklet'
      if (e.translationY > 120 || e.velocityY > 900) {
        offset.value = withTiming(screen, timings.flyOff, () => scheduleOnRN(onClose))
      } else offset.value = withSpring(0, springs.sheet)
    },
  })

  // Each time it opens it rises from below. (After the drag above, which writes the same offset.)
  useEffect(() => {
    if (!open) return
    if (reduced) offset.value = 0
    else {
      offset.value = screen * 0.5
      offset.value = withSpring(0, springs.sheet)
    }
  }, [open, reduced, screen, offset])

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }))
  const backdropStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - offset.value / (screen * 0.6)) }))

  return (
    <Modal testID={testID} visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <GestureHandlerRootView style={styles.fill}>
        <KeyboardAvoidingView style={styles.end} behavior="padding">
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }, backdropStyle]}>
            <RNPressable style={styles.fill} onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} />
          </Animated.View>
          <Animated.View style={[styles.sheet, { backgroundColor: colors.card, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, paddingBottom: insets.bottom + spacing.md }, shadow.float, sheetStyle]}>
            <GestureDetector gesture={drag}>
              <View style={{ paddingTop: spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: title ? spacing.sm : spacing.xs }}>
                <View style={[styles.handle, { backgroundColor: colors.lineStrong }]} />
                {title ? (
                  <Text style={[type.section, { color: colors.ink, paddingTop: spacing.md }]} accessibilityRole="header">
                    {title}
                  </Text>
                ) : null}
              </View>
            </GestureDetector>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.xs }} bounces={false}>
              {children}
            </ScrollView>
            {footer ? <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md }}>{footer}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  )
}

/** A label (and hint) with a switch; a light tap when it flips. */
export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (value: boolean) => void }) {
  const { colors, type, spacing } = useTheme()
  return (
    <View style={[styles.toggle, { gap: spacing.md }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.bodyMedium, { color: colors.ink }]}>{label}</Text>
        {hint ? <Text style={[type.small, { color: colors.muted }]}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          haptics.select()
          onChange(v)
        }}
        accessibilityLabel={label}
        trackColor={{ true: colors.accent, false: colors.lineStrong }}
        thumbColor={value ? colors.onAccent : '#FFFFFF'}
      />
    </View>
  )
}

/** A white card: radius 28, a soft shadow in light mode, no border. */
export function Card({ title, children, hint, style, right }: { title?: string; hint?: string; children?: ReactNode; style?: StyleProp<ViewStyle>; right?: ReactNode }) {
  const { colors, type, spacing, radius, shadow } = useTheme()
  return (
    <View style={[{ borderRadius: radius.card, backgroundColor: colors.card, padding: spacing.xl, gap: spacing.md }, shadow.card, style]}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          <View style={{ gap: 2, flex: 1 }}>
            <Text style={[type.section, { color: colors.ink }]} accessibilityRole="header">
              {title}
            </Text>
            {hint ? <Text style={[type.small, { color: colors.muted }]}>{hint}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  )
}

/** A section's title over the canvas, with a muted detail or a small action on the right. */
export function SectionHeader({ title, detail, action }: { title: string; detail?: string; action?: { label: string; onPress: () => void } }) {
  const { colors, type, spacing } = useTheme()
  return (
    <View style={[styles.sectionHeader, { paddingHorizontal: 4, gap: spacing.md }]}>
      <Text style={[type.section, { color: colors.ink, flexShrink: 1 }]} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {action ? (
        <RNPressable onPress={action.onPress} accessibilityRole="button" accessibilityLabel={action.label} hitSlop={12}>
          <Text style={[type.small, { color: colors.muted }]}>{action.label}</Text>
        </RNPressable>
      ) : detail ? (
        <Text style={[type.small, { color: colors.muted }]} numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
    </View>
  )
}

/** A white card of rows with hairlines between them, like iOS grouped lists. */
export function GroupedList({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const { colors, radius, shadow, spacing } = useTheme()
  const rows = Children.toArray(children).filter(isValidElement)
  return (
    <View testID={testID} style={[{ backgroundColor: colors.card, borderRadius: radius.card, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs }, shadow.card, style]}>
      {rows.map((row, i) => (
        <Fragment key={row.key ?? i}>
          {i > 0 ? <View style={[styles.hairline, { backgroundColor: colors.line }]} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  )
}

/** A titled grouped list on the canvas, with an optional muted line under it (Settings' groups). */
export function Section({ title, hint, children, testID }: { title: string; hint?: string; children: ReactNode; testID?: string }) {
  const { colors, type, spacing } = useTheme()
  return (
    <View testID={testID} style={{ gap: spacing.sm }}>
      <SectionHeader title={title} />
      <GroupedList>{children}</GroupedList>
      {hint ? <Text style={[type.small, { color: colors.muted, paddingHorizontal: spacing.xs + 4 }]}>{hint}</Text> : null}
    </View>
  )
}

/** One row of a grouped list: something on the left, a title and subtitle, something on the right. */
export function Row({
  title,
  subtitle,
  left,
  right,
  chevron,
  onPress,
  testID,
  accessibilityLabel,
  accessibilityRole,
}: {
  title: ReactNode
  subtitle?: ReactNode
  left?: ReactNode
  right?: ReactNode
  chevron?: boolean
  onPress?: () => void
  testID?: string
  accessibilityLabel?: string
  accessibilityRole?: 'button' | 'link'
}) {
  const { colors, type, spacing } = useTheme()
  const body = (
    <>
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        {typeof title === 'string' ? (
          <Text style={[type.bodyMedium, { color: colors.ink }]} numberOfLines={1}>
            {title}
          </Text>
        ) : (
          title
        )}
        {typeof subtitle === 'string' ? (
          <Text style={[type.small, { color: colors.muted }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : (
          subtitle
        )}
      </View>
      {right}
      {chevron ? <ChevronRight size={18} strokeWidth={1.8} color={colors.muted} /> : null}
    </>
  )
  const style = [styles.row, { gap: spacing.md, paddingVertical: spacing.md }]
  if (!onPress)
    return (
      <View testID={testID} style={style} accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    )
  return (
    <Pressable testID={testID} onPress={onPress} scaleTo={0.98} accessibilityRole={accessibilityRole ?? 'button'} accessibilityLabel={accessibilityLabel} style={style}>
      {body}
    </Pressable>
  )
}

/** A square tile with an icon or two letters, for the left of a row. */
export function Tile({ children, bg, size = 40 }: { children: ReactNode; bg: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size * 0.34, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
}

/** What a list shows with nothing in it: an icon on a lime tile, a title, a line and maybe an action. */
export function EmptyState({ icon: Icon, title, body, action, card = true, testID }: { icon?: LucideIcon; title: string; body?: string; action?: ReactNode; card?: boolean; testID?: string }) {
  const { colors, type, spacing, radius, shadow } = useTheme()
  return (
    <View testID={testID} style={[{ alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl, gap: spacing.sm }, card && [{ backgroundColor: colors.card, borderRadius: radius.card }, shadow.card]]}>
      {Icon ? (
        <View style={{ width: 56, height: 56, borderRadius: 20, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs }}>
          <Icon size={24} strokeWidth={1.8} color={colors.accentInk} />
        </View>
      ) : null}
      <Text style={[type.section, { color: colors.ink, textAlign: 'center' }]}>{title}</Text>
      {body ? <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>{body}</Text> : null}
      {action ? <View style={{ paddingTop: spacing.sm }}>{action}</View> : null}
    </View>
  )
}

/** A number with − and + buttons. */
export function Stepper({ label, value, step = 5, min = 0, max = 600, unit = 'min', onChange }: { label: string; value: number; step?: number; min?: number; max?: number; unit?: string; onChange: (value: number) => void }) {
  const { colors, type, spacing } = useTheme()
  return (
    <View style={[styles.toggle, { gap: spacing.sm }]}>
      <Text style={[type.bodyMedium, { color: colors.ink, flex: 1 }]}>{label}</Text>
      <IconButton icon={Minus} label={`Less ${label}`} variant="raised" size={40} haptic="select" disabled={value <= min} onPress={() => onChange(Math.max(min, value - step))} />
      <Text style={[type.bodyMedium, { color: colors.ink, minWidth: 64, textAlign: 'center', fontVariant: ['tabular-nums'] }]}>{`${value} ${unit}`}</Text>
      <IconButton icon={Plus} label={`More ${label}`} variant="raised" size={40} haptic="select" disabled={value >= max} onPress={() => onChange(Math.min(max, value + step))} />
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  end: { flex: 1, justifyContent: 'flex-end' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  chip: { height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeDot: { position: 'absolute', top: 9, right: 9, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  input: { minHeight: 52, borderWidth: 1.5 },
  multiline: { minHeight: 96, textAlignVertical: 'top', paddingTop: 14, paddingBottom: 14 },
  selectRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  selectValue: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  option: { minHeight: 52, flexDirection: 'row', alignItems: 'center' },
  sheet: { maxHeight: '88%' },
  handle: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3 },
  toggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  hairline: { height: StyleSheet.hairlineWidth },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center' },
})
