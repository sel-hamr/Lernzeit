import { count } from '@lernzeit/core/text'
import { useRef, useState } from 'react'
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import mark from '../assets/splash-icon.png'
import { failureMessage, OtherAccountError, useAccountService } from '../src/account'
import { useLocalLibrary } from '../src/store/live'
import { useTheme } from '../src/theme'

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
  const { colors, type, spacing, radius, sizes } = useTheme()
  const insets = useSafeAreaInsets()
  const service = useAccountService()
  const library = useLocalLibrary()
  const passwordRef = useRef<React.ElementRef<typeof TextInput>>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
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

  const field = [styles.field, type.body, { color: colors.ink, backgroundColor: colors.field, borderColor: colors.line, borderRadius: radius.row }]

  return (
    <KeyboardAvoidingView style={[styles.page, { backgroundColor: colors.main }]} behavior="padding">
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingHorizontal: spacing.pageX, paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.xxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.header, { gap: spacing.md }]}>
          <Image source={mark} style={styles.mark} accessibilityIgnoresInvertColors />
          <Text style={[type.title, { color: colors.ink }]} accessibilityRole="header">
            Welcome back
          </Text>
          <Text style={[type.body, { color: colors.muted }]}>Sign in with your Lernzeit account.</Text>
        </View>

        <View style={{ gap: spacing.md }}>
          <Text style={[type.small, { color: colors.ink2 }]}>Email</Text>
          <TextInput
            style={field}
            placeholder="Email"
            placeholderTextColor={colors.muted}
            value={email}
            onChangeText={(text) => {
              setEmail(text)
              setOtherAccount(undefined)
            }}
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
          <Text style={[type.small, { color: colors.ink2 }]}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              ref={passwordRef}
              style={[...field, styles.passwordField]}
              placeholder="Password"
              placeholderTextColor={colors.muted}
              value={password}
              onChangeText={setPassword}
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
            <Pressable
              onPress={() => setShown((value) => !value)}
              style={styles.toggle}
              accessibilityRole="button"
              accessibilityLabel={shown ? 'Hide password' : 'Show password'}
            >
              <Text style={[type.small, { color: colors.muted }]}>{shown ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>

          {error ? (
            <Text style={[type.body, { color: colors.redInk }]} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          {otherAccount ? (
            <Pressable onPress={() => removeData(otherAccount)} accessibilityRole="button" accessibilityLabel="Remove this phone’s data" style={styles.link}>
              <Text style={[type.bodyMedium, { color: colors.redInk }]}>Remove this phone’s data</Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={submit}
            disabled={busy || !ready}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            accessibilityState={{ disabled: busy || !ready, busy }}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: pressed ? colors.buttonDarkPressed : colors.buttonDark, opacity: ready || busy ? 1 : 0.5, height: sizes.button },
            ]}
          >
            {busy ? <ActivityIndicator color={colors.onDark} /> : <Text style={[type.bodyMedium, { color: colors.onDark }]}>Sign in</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center' },
  header: { alignItems: 'flex-start' },
  mark: { width: 48, height: 48 },
  field: { borderWidth: 1, paddingHorizontal: 14, height: 48 },
  passwordRow: { justifyContent: 'center' },
  passwordField: { paddingRight: 64 },
  toggle: { position: 'absolute', right: 0, minWidth: 64, height: 48, alignItems: 'center', justifyContent: 'center' },
  link: { minHeight: 48, justifyContent: 'center', marginBottom: 12 },
  button: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
})
