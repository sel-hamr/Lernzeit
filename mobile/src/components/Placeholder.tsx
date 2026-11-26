import { Sparkles } from 'lucide-react-native'
import { View } from 'react-native'
import { FadeInUp } from '../motion'
import { useTheme } from '../theme'
import { EmptyState } from '../ui'

/** A page that arrives in a later update: its name (when the page has no header of its own) and a plain line, on a white card. `gutter` adds the page margin on a tab. */
export function Placeholder({ title, message = 'Coming in the next update', gutter }: { title?: string; message?: string; gutter?: boolean }) {
  const { colors, spacing } = useTheme()
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: spacing.pageTop, paddingHorizontal: gutter ? spacing.pageX : 0 }}>
      <FadeInUp>
        <EmptyState icon={Sparkles} title={title ?? message} body={title ? message : 'Until then, you find it in the web app.'} />
      </FadeInUp>
    </View>
  )
}
