import { germanText } from '@lernzeit/core/german'
import { useRouter } from 'expo-router'
import { ChevronLeft, Search, SearchX, X } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { FlatList, KeyboardAvoidingView, Pressable as RNPressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CardPicture, GermanLine } from '../src/cards/CardPicture'
import { useCards, useDecks } from '../src/cards/data'
import { cardMatches } from '../src/cards/search'
import { FadeInUp, Pressable } from '../src/motion'
import { useTheme } from '../src/theme'
import { EmptyState, IconButton } from '../src/ui'

const LIMIT = 60

/** Search: your cards by English, German or tag, as you type; a tap opens the card. */
export default function SearchPage() {
  const { colors, type, spacing, radius, shadow } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const cards = useCards()
  const decks = useDecks()
  const [query, setQuery] = useState('')
  const q = query.trim()
  const results = useMemo(() => (q ? cards.filter((c) => cardMatches(c, q)).sort((a, b) => a.german.localeCompare(b.german, 'de')) : []), [cards, q])
  const deckName = (id: string) => decks.find((d) => d.id === id)?.name ?? ''

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.page, { backgroundColor: colors.canvas, paddingTop: insets.top }]}>
      <View style={[styles.header, { paddingHorizontal: spacing.pageX - 4, gap: spacing.sm }]}>
        <IconButton icon={ChevronLeft} label="Back" iconSize={22} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={[styles.field, { backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: spacing.lg, gap: spacing.sm }, shadow.card]}>
          <Search size={18} strokeWidth={1.8} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search your cards"
            placeholderTextColor={colors.muted}
            selectionColor={colors.ink}
            cursorColor={colors.ink}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search your cards"
            style={[type.body, styles.input, { color: colors.ink }]}
          />
          {query ? (
            <RNPressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear the search" hitSlop={12}>
              <X size={18} strokeWidth={1.8} color={colors.muted} />
            </RNPressable>
          ) : null}
        </View>
      </View>
      <FlatList
        data={results.slice(0, LIMIT)}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: spacing.pageX, paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.sm }}
        ListHeaderComponent={
          q && results.length ? (
            <Text style={[type.small, { color: colors.muted, paddingHorizontal: 4, paddingBottom: spacing.xs }]}>
              {results.length > LIMIT ? `First ${LIMIT} of ${results.length} cards` : `${results.length} ${results.length === 1 ? 'card' : 'cards'}`}
            </Text>
          ) : undefined
        }
        ListEmptyComponent={
          <FadeInUp>
            {q ? (
              <EmptyState icon={SearchX} title="Nothing found" body={`No card has “${q}” in its German, English or tags.`} />
            ) : (
              <EmptyState icon={Search} title="Search your cards" body={cards.length ? `Type a word in German or English to look through ${cards.length} cards.` : 'Once you add flashcards, you can find them here.'} />
            )}
          </FadeInUp>
        }
        renderItem={({ item, index }) => (
          <FadeInUp index={Math.min(index, 8)}>
            <Pressable
              onPress={() => router.push(`/card/${item.id}`)}
              scaleTo={0.98}
              accessibilityRole="button"
              accessibilityLabel={`${germanText(item)}, ${item.english}`}
              style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.block, padding: spacing.sm, paddingRight: spacing.md, gap: spacing.md }, shadow.card]}
            >
              <CardPicture card={item} height={48} emojiSize={24} style={{ width: 48, borderRadius: 12 }} />
              <View style={[styles.grow, { gap: 2 }]}>
                <GermanLine card={item} style={[type.bodyMedium, { color: colors.ink }]} />
                <Text style={[type.small, { color: colors.muted }]} numberOfLines={1}>
                  {[item.english, deckName(item.deckId)].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </Pressable>
          </FadeInUp>
        )}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: { height: 64, flexDirection: 'row', alignItems: 'center' },
  field: { flex: 1, height: 48, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, height: 48, paddingVertical: 0 },
  row: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
})
