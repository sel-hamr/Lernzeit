import { useRouter } from 'expo-router'
import { EyeOff } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { featureById, useHiddenFeatures } from '../features'
import { FadeInUp } from '../motion'
import { useTheme } from '../theme'
import { Button, EmptyState } from '../ui'
import { Screen } from './Screen'

/** A page of a feature turned off in Settings shows that, with a way to turn it back on. */
export function FeatureGate({ id, tab, children }: { id: string; tab?: boolean; children: ReactNode }) {
  const hidden = useHiddenFeatures()
  const router = useRouter()
  const { colors, spacing } = useTheme()
  if (!hidden.includes(id)) return <>{children}</>
  const label = featureById(id)?.label ?? 'This page'
  const off = (
    <FadeInUp>
      <EmptyState icon={EyeOff} title={`${label} is turned off`} body="Turn it on again in Settings, under Features. Nothing you saved was deleted." action={<Button label="Open Settings" onPress={() => router.push('/settings')} />} />
    </FadeInUp>
  )
  if (tab) return <View style={{ flex: 1, backgroundColor: colors.canvas, paddingHorizontal: spacing.pageX, paddingTop: spacing.pageTop }}>{off}</View>
  return <Screen title={label}>{off}</Screen>
}
