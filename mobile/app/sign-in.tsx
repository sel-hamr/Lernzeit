import { count } from '@lernzeit/core/text'
import { useRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react-native'
import { Alert, Image, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import mark from '../assets/splash-icon.png'
import markDark from '../assets/splash-icon-dark.png'
import { failureMessage, OtherAccountError, useAccountService } from '../src/account'
import { useLocalLibrary } from '../src/store/live'
import { FadeInUp } from '../src/motion'
import { useTheme } from '../src/theme'
import { Button, IconButton } from '../src/ui'

/** What the removal confirmation says: how much is lost, and that it cannot be undone. */
export function removalWarning(waiting: number): string {
  const lost = waiting > 0 ? `${count(waiting, 'change is', 'changes are')} not uploaded and will be lost for good.` : 'Nothing is waiting to be uploaded, so nothing unsynced is lost.'
  return `${lost} This can’t be undone. Your data in the cloud stays.`
}

/**
 * Sign-in to the Lernzeit cloud. Once the account is stored the root layout leaves this screen by
 * itself. The password lives only in this field's state while typing: never logged, never saved.
 */
export default function SignIn() {
  const { colors, type, spacing, radius, shadow, scheme } = useTheme()
  const insets = useSafeAreaInsets()
  const service = useAccountService()
  const library = useLocalLibrary()
  const passwordRef = useRef<React.ElementRef<typeof TextInput>>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const [focus, setFocus] = useState<'email' | 'password'>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  // Set when another account's data is still on this phone: the way out is to remove it.
  const [otherAccount, setOtherAccount] = useState<string>()

  const ready = email.trim() !== '' && password !== ''

  async function submit() {
    if (busy || !ready) return
    setBusy(true)
    setError(undefined)
    setOtherAccount(undefined)
    try {
      await service.signIn(email, password)
      setPassword('')
    } catch (failure) {
      setError(failureMessage(failure))
      if (failure instanceof OtherAccountError) setOtherAccount(failure.lastAccount)
    }
    setBusy(false)
  }

  // A 401 signed this phone out but kept its data; there is no Settings to sign out from, so it is removed here, after a confirmation.
  function removeData(owner: string) {
    Alert.alert(`Remove ${owner}’s data from this phone?`, removalWarning(library.outboxSize()), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove data',
        style: 'destructive',
        onPress: () => {
          service.signOut({ force: true }).then(
            () => {
              setOtherAccount(undefined)
              setError(undefined)
            },
            (failure: unknown) => setError(failureMessage(failure)),
          )
        },
      },
    ])
  }

  return (
    <KeyboardAvoidingView style={[styles.page, { backgroundColor: colors.canvas }]} behavior="padding">
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: spacing.pageX, paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <FadeInUp index={0} style={{ gap: spacing.md }}>
          <View style={[styles.markTile, { backgroundColor: colors.card, borderRadius: radius.block }, shadow.card]}>
            <Image source={scheme === 'dark' ? markDark : mark} style={styles.mark} accessibilityIgnoresInvertColors />
          </View>
          <Text style={[type.title, styles.bigTitle, { color: colors.ink }]} accessibilityRole="header">
            Welcome back
          </Text>
          <Text style={[type.body, { color: colors.muted }]}>Sign in with your Lernzeit account.</Text>
        </FadeInUp>

        <FadeInUp index={1}>
          <View style={[{ backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl, gap: spacing.md }, shadow.card]}>
            <Text style={[type.small, { color: colors.muted, paddingHorizontal: 4 }]}>Email</Text>
            <TextInput
              style={[styles.field, type.body, { color: colors.ink, backgroundColor: colors.raised, borderColor: focus === 'email' ? colors.ink : 'transparent', borderRadius: radius.row }]}
              placeholder="Email"
              placeholderTextColor={colors.muted}
              selectionColor={colors.ink}
              cursorColor={colors.ink}
              value={email}
              onChangeText={(text) => {
                setEmail(text)
                setOtherAccount(undefined)
              }}
              onFocus={() => setFocus('email')}
              onBlur={() => setFocus(undefined)}
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              editable={!busy}
              accessibilityLabel="Email"
            />
            <Text style={[type.small, { color: colors.muted, paddingHorizontal: 4 }]}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                ref={passwordRef}
                style={[styles.field, styles.passwordField, type.body, { color: colors.ink, backgroundColor: colors.raised, borderColor: focus === 'password' ? colors.ink : 'transparent', borderRadius: radius.row }]}
                placeholder="Password"
                placeholderTextColor={colors.muted}
                selectionColor={colors.ink}
                cursorColor={colors.ink}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocus('password')}
                onBlur={() => setFocus(undefined)}
                secureTextEntry={!shown}
                autoCapitalize="none"
                autoComplete="current-password"
                autoCorrect={false}
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={submit}
                editable={!busy}
                accessibilityLabel="Password"
              />
              <View style={styles.toggle}>
                <IconButton icon={shown ? EyeOff : Eye} label={shown ? 'Hide password' : 'Show password'} variant="ghost" size={44} iconSize={18} onPress={() => setShown((value) => !value)} />
              </View>
            </View>

            {error ? (
              <View style={{ backgroundColor: colors.dangerSoft, borderRadius: radius.row, padding: spacing.md }}>
                <Text style={[type.body, { color: colors.dangerInk }]} accessibilityRole="alert">
                  {error}
                </Text>
              </View>
            ) : null}

            {otherAccount ? (
              <Button label="Remove this phone’s data" variant="danger" size="sm" haptic="warning" onPress={() => removeData(otherAccount)} />
            ) : null}

            <Button label="Sign in" size="lg" haptic="tap" disabled={!ready} busy={busy} onPress={() => void submit()} style={{ marginTop: spacing.xs }} />
          </View>
        </FadeInUp>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center' },
  markTile: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 44, height: 44 },
  bigTitle: { fontSize: 34, lineHeight: 40, letterSpacing: -1 },
  field: { borderWidth: 1.5, paddingHorizontal: 16, height: 52 },
  passwordRow: { justifyContent: 'center' },
  passwordField: { paddingRight: 56 },
  toggle: { position: 'absolute', right: 4 },
})
