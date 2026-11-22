/*
 * Small shared pieces for the screens: pill buttons, text fields, option rows, sheets, switches.
 * Plain Lernzeit style (SPEC section 11): hairline borders, dark pill primary, no emoji in chrome.
 */
import { Check, ChevronDown } from 'lucide-react-native'
import { useState, type ReactNode } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from './theme'

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  busy,
  style,
}: {
  label: string
  onPress: () => void
  variant?: 'primary' | 'outline' | 'danger'
  icon?: ReactNode
  disabled?: boolean
  busy?: boolean
  style?: ViewStyle
}) {
  const { colors, type, spacing, radius } = useTheme()
  const dark = variant === 'primary'
  const fg = dark ? colors.onDark : variant === 'danger' ? colors.redInk : colors.ink
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      style={({ pressed }) => [
        styles.button,
        {
          borderRadius: radius.pill,
          paddingHorizontal: spacing.xl,
          gap: spacing.sm,
          borderColor: dark ? colors.buttonDark : colors.lineStrong,
          backgroundColor: dark ? (pressed ? colors.buttonDarkPressed : colors.buttonDark) : pressed ? colors.field : 'transparent',
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : icon}
      <Text style={[type.bodyMedium, { color: fg }]}>{label}</Text>
    </Pressable>
  )
}

export function Chip({ label, selected, onPress, color }: { label: string; selected?: boolean; onPress?: () => void; color?: string }) {
  const { colors, type, spacing, radius } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      style={[styles.chip, { borderRadius: radius.pill, paddingHorizontal: spacing.md, borderColor: selected ? colors.ink : colors.lineStrong, backgroundColor: selected ? colors.field : 'transparent' }]}
    >
      {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <Text style={[type.small, { color: selected ? colors.ink : colors.ink2 }]}>{label}</Text>
    </Pressable>
  )
}

export function Field({ label, ...props }: TextInputProps & { label?: string }) {
  const { colors, type, spacing, radius } = useTheme()
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? <Text style={[type.small, { color: colors.muted }]}>{label}</Text> : null}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...props}
        style={[type.body, styles.input, { color: colors.ink, borderColor: colors.lineStrong, backgroundColor: colors.main, borderRadius: radius.row, paddingHorizontal: spacing.md }, props.multiline && styles.multiline, props.style]}
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
}: {
  label: string
  value: T
  display?: string
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  disabled?: boolean
}) {
  const { colors, type, spacing, radius } = useTheme()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${display ?? options.find((o) => o.value === value)?.label ?? value}`}
        style={[styles.selectRow, { backgroundColor: colors.field, borderRadius: radius.row, paddingHorizontal: spacing.md, opacity: disabled ? 0.5 : 1 }]}
      >
        <Text style={[type.small, { color: colors.muted }]}>{label}</Text>
        <View style={styles.selectValue}>
          <Text style={[type.bodyMedium, { color: colors.ink, flexShrink: 1 }]} numberOfLines={1}>
            {display ?? options.find((o) => o.value === value)?.label ?? value}
          </Text>
          <ChevronDown size={16} strokeWidth={1.7} color={colors.muted} />
        </View>
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        {options.map((o) => (
          <Pressable
            key={o.value}
            onPress={() => {
              setOpen(false)
              onChange(o.value)
            }}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: o.value === value }}
            style={({ pressed }) => [styles.option, { paddingHorizontal: spacing.md, backgroundColor: pressed ? colors.field : 'transparent', borderRadius: radius.img }]}
          >
            <Text style={[o.value === value ? type.bodyMedium : type.body, { color: colors.ink, flex: 1 }]}>{o.label}</Text>
            {o.value === value ? <Check size={17} strokeWidth={2} color={colors.sageInk} /> : null}
          </Pressable>
        ))}
      </Sheet>
    </>
  )
}

/** A bottom sheet over the page; closes on the back button and on a tap outside. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children?: ReactNode }) {
  const { colors, type, spacing } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.fill}>
        <Pressable style={[styles.fill, { backgroundColor: colors.scrim }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: colors.main, borderColor: colors.line, paddingBottom: insets.bottom + spacing.md, paddingHorizontal: spacing.md, paddingTop: spacing.md }]}>
          {title ? (
            <Text style={[type.section, { color: colors.ink, paddingHorizontal: spacing.md, paddingBottom: spacing.sm }]} accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </View>
    </Modal>
  )
}

export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (value: boolean) => void }) {
  const { colors, type, spacing } = useTheme()
  return (
    <View style={[styles.toggle, { gap: spacing.md }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.bodyMedium, { color: colors.ink }]}>{label}</Text>
        {hint ? <Text style={[type.small, { color: colors.muted }]}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: colors.sageBar, false: colors.lineStrong }} thumbColor={colors.main} />
    </View>
  )
}

export function Card({ title, children, hint }: { title?: string; hint?: string; children: ReactNode }) {
  const { colors, type, spacing, radius } = useTheme()
  return (
    <View style={{ borderColor: colors.line, borderWidth: 1, borderRadius: radius.section, backgroundColor: colors.main, padding: spacing.lg, gap: spacing.md }}>
      {title ? (
        <View style={{ gap: 2 }}>
          <Text style={[type.section, { color: colors.ink }]} accessibilityRole="header">
            {title}
          </Text>
          {hint ? <Text style={[type.small, { color: colors.muted }]}>{hint}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  )
}

export function Stepper({ label, value, step = 5, min = 0, max = 600, unit = 'min', onChange }: { label: string; value: number; step?: number; min?: number; max?: number; unit?: string; onChange: (value: number) => void }) {
  const { colors, type, spacing } = useTheme()
  return (
    <View style={[styles.toggle, { gap: spacing.md }]}>
      <Text style={[type.bodyMedium, { color: colors.ink, flex: 1 }]}>{label}</Text>
      <Chip label="-" onPress={() => onChange(Math.max(min, value - step))} />
      <Text style={[type.bodyMedium, { color: colors.ink, minWidth: 56, textAlign: 'center' }]}>{`${value} ${unit}`}</Text>
      <Chip label="+" onPress={() => onChange(Math.min(max, value + step))} />
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  button: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  chip: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  input: { minHeight: 44, borderWidth: 1 },
  multiline: { minHeight: 80, textAlignVertical: 'top', paddingVertical: 10 },
  selectRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  selectValue: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  option: { minHeight: 48, flexDirection: 'row', alignItems: 'center' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: 1, maxHeight: '85%' },
  toggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center' },
})
