import { germanText } from '@lernzeit/core/german'
import { directionsFor } from '@lernzeit/core/srs'
import { ALL_DIRECTIONS } from '@lernzeit/core/practice'
import type { Card, Direction } from '@lernzeit/core/types'
import { useRouter } from 'expo-router'
import { ChevronDown, ChevronRight, Copy, Ellipsis, History, Play, Plus, Search, SearchX, SlidersHorizontal, Upload, X } from 'lucide-react-native'
import { memo, useCallback, useMemo, useState } from 'react'
import { count } from '@lernzeit/core/text'
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { listEnter, listExit, listLayout, Pressable } from '../motion'
import { CardListSkeleton } from '../components/Skeletons'
import { useFirstSync } from '../sync/status'
import { useTabBarSpace } from '../components/BottomBar'
import { useLocalLibrary } from '../store/live'
import { numbers, useTheme } from '../theme'
import { Button, Chip, EmptyState, Field, IconButton, OptionRow, Sheet, Tile } from '../ui'
import { CardPicture, GermanLine } from './CardPicture'
import { INCOMPLETE_TAG, quickAddCard, useCards, useDecks } from './data'
import { cardMatches } from './search'

type Filter = 'all' | 'incomplete' | 'nopicture'
type Sort = 'newest' | 'oldest' | 'german' | 'english'
const SORTS: [Sort, string][] = [
  ['newest', 'Newest'],
  ['oldest', 'Oldest'],
  ['german', 'German A-Z'],
  ['english', 'English A-Z'],
]
const FILTERS: [Filter, string][] = [
  ['all', 'All cards'],
  ['incomplete', 'Incomplete'],
  ['nopicture', 'No picture'],
]
const DIRECTION_LABEL: Record<Direction, string> = { imageToDe: 'Picture to German', enToDe: 'English to German', deToEn: 'German to English', cloze: 'Fill the gap' }

/** The Cards tab: the deck card with Practise, search with a filter button (show and sort in a sheet), one grouped card list and the floating Practise button (adding cards is in the ⋯ menu). */
export function CardsScreen() {
  const { colors, type, spacing, radius, shadow, fonts, sizes } = useTheme()
  const router = useRouter()
  const library = useLocalLibrary()
  const barSpace = useTabBarSpace()
  const fabBottom = useTabBarSpace(spacing.lg)
  const decks = useDecks()
  const cards = useCards()
  const [deckId, setDeckId] = useState('all')
  const [deckSheet, setDeckSheet] = useState(false)
  const [filterSheet, setFilterSheet] = useState(false)
  const [menu, setMenu] = useState(false)
  const [practise, setPractise] = useState(false)
  const [add, setAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('newest')

  const deck = decks.find((d) => d.id === deckId)
  const firstSync = useFirstSync()
  const openCard = useCallback((id: string) => router.push(`/card/${id}`), [router])
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of cards) m.set(c.deckId, (m.get(c.deckId) ?? 0) + 1)
    return m
  }, [cards])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = cards.filter((c) => {
      if (deck && c.deckId !== deck.id) return false
      if (filter === 'incomplete' && !c.tags.includes(INCOMPLETE_TAG)) return false
      if (filter === 'nopicture' && (c.imageId || c.emoji)) return false
      return cardMatches(c, q)
    })
    const by: Record<Sort, (a: Card, b: Card) => number> = {
      newest: (a, b) => b.createdAt - a.createdAt,
      oldest: (a, b) => a.createdAt - b.createdAt,
      german: (a, b) => a.german.localeCompare(b.german, 'de'),
      english: (a, b) => a.english.localeCompare(b.english),
    }
    return list.sort(by[sort])
  }, [cards, deck, filter, search, sort])

  const total = deck ? (counts.get(deck.id) ?? 0) : cards.length
  const targetDeck = deck?.id ?? decks[0]?.id ?? ''
  const sortLabel = SORTS.find(([s]) => s === sort)?.[1] ?? 'Newest'
  const filterLabel = FILTERS.find(([f]) => f === filter)?.[1] ?? 'All cards'
  const filtered = filter !== 'all' || sort !== 'newest'
  const countLine = `${shown.length === total ? count(total, 'card') : `${shown.length} of ${count(total, 'card')}`}${sort === 'newest' ? '' : ` · ${sortLabel}`}`
  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <View style={[styles.row, { gap: spacing.sm }]}>
        <View style={[styles.deckCard, { backgroundColor: colors.card, borderRadius: radius.block + 4, paddingRight: spacing.sm }, shadow.card]}>
          <Pressable
            onPress={() => setDeckSheet(true)}
            scaleTo={0.98}
            accessibilityRole="button"
            accessibilityLabel={`Deck: ${deck?.name ?? 'All decks'}, ${count(total, 'card')}`}
            style={[styles.row, styles.grow, { alignSelf: 'stretch', paddingLeft: spacing.lg, gap: spacing.xs }]}
          >
            <View style={[styles.grow, { gap: 1 }]}>
              <View style={[styles.row, { gap: 4 }]}>
                <Text style={[type.bodyMedium, { color: colors.ink, fontFamily: fonts.semibold, flexShrink: 1 }]} numberOfLines={1}>
                  {deck?.name ?? 'All decks'}
                </Text>
                <ChevronDown size={16} strokeWidth={2} color={colors.muted} />
              </View>
              <Text style={[type.small, numbers, { color: colors.muted }]} numberOfLines={1}>
                {count(total, 'card')}
              </Text>
            </View>
          </Pressable>
        </View>
        <IconButton icon={Ellipsis} label="More" onPress={() => setMenu(true)} />
      </View>
      <View style={[styles.row, { gap: spacing.sm }]}>
        <View style={[styles.search, styles.grow, { backgroundColor: colors.card, borderRadius: radius.pill, paddingLeft: spacing.lg, paddingRight: spacing.md, gap: spacing.sm }, shadow.card]}>
          <Search size={18} strokeWidth={1.8} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search cards"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Search cards"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            selectionColor={colors.ink}
            cursorColor={colors.ink}
            style={[type.body, styles.grow, { color: colors.ink, paddingVertical: 0 }]}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} scaleTo={0.85} accessibilityRole="button" accessibilityLabel="Clear the search" hitSlop={12}>
              <X size={18} strokeWidth={1.8} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <IconButton icon={SlidersHorizontal} label={filtered ? `Filter and sort: ${filterLabel}, ${sortLabel}` : 'Filter and sort'} size={48} badge={filtered ? colors.accent : undefined} onPress={() => setFilterSheet(true)} />
      </View>
      {filter !== 'all' ? (
        <Animated.View entering={listEnter} exiting={listExit} style={styles.chipWrap}>
        <Pressable
          onPress={() => setFilter('all')}
          haptic="select"
          scaleTo={0.95}
          accessibilityRole="button"
          accessibilityLabel={`Remove the filter ${filterLabel}`}
          hitSlop={6}
          style={[styles.row, styles.chip, { backgroundColor: colors.primary, borderRadius: radius.pill, gap: 6 }]}
        >
          <Text style={[type.chip, { color: colors.onPrimary, fontFamily: fonts.semibold }]}>{filterLabel}</Text>
          <X size={14} strokeWidth={2.2} color={colors.onPrimary} />
        </Pressable>
        </Animated.View>
      ) : null}
      {shown.length ? <Text style={[type.small, numbers, { color: colors.muted, paddingHorizontal: 4, paddingTop: spacing.xs }]}>{countLine}</Text> : null}
    </View>
  )

  return (
    <View style={[styles.grow, { backgroundColor: colors.canvas }]}>
      <Animated.FlatList
        data={shown}
        keyExtractor={cardKey}
        ListHeaderComponent={header}
        ListEmptyComponent={
          cards.length === 0 && firstSync ? (
            <CardListSkeleton />
          ) : cards.length === 0 ? (
            <EmptyState
              icon={Copy}
              title="No cards yet"
              body={decks.length ? 'Add a card or import a CSV from the ⋯ menu.' : 'Make a deck on the web first, then add cards here.'}
              action={decks.length ? <Button label="Import a CSV" variant="soft" size="sm" icon={<Upload size={15} color={colors.ink} />} onPress={() => router.push({ pathname: '/import-csv', params: { deckId: targetDeck } })} /> : undefined}
            />
          ) : (
            <EmptyState icon={SearchX} title="No cards match" body="Try another word, filter or deck." />
          )
        }
        contentContainerStyle={{ paddingHorizontal: spacing.pageX, paddingTop: spacing.xs, paddingBottom: barSpace + sizes.fab }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // A card added or deleted slides the rows around it; not while typing a search, where every key would reshuffle the list.
        itemLayoutAnimation={search ? undefined : listLayout}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={9}
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={({ item, index }) => <CardRow card={item} first={index === 0} last={index === shown.length - 1} onOpen={openCard} />}
      />
      <Pressable
        onPress={() => setPractise(true)}
        disabled={cards.length === 0}
        haptic="tap"
        scaleTo={0.94}
        accessibilityRole="button"
        accessibilityLabel={`Practise ${deck?.name ?? 'all decks'}`}
        style={[styles.fab, { backgroundColor: colors.accent, right: spacing.pageX, bottom: fabBottom, opacity: cards.length ? 1 : 0.4, gap: spacing.sm }, shadow.float]}
      >
        <Play size={18} color={colors.onAccent} fill={colors.onAccent} />
        <Text style={[type.button, { color: colors.onAccent, fontFamily: fonts.semibold }]}>Practise</Text>
      </Pressable>

      <Sheet open={deckSheet} onClose={() => setDeckSheet(false)} title="Deck">
        {[{ id: 'all', name: 'All decks', count: cards.length }, ...decks.map((d) => ({ id: d.id, name: d.name, count: counts.get(d.id) ?? 0 }))].map((d) => (
          <OptionRow
            key={d.id}
            label={d.name}
            detail={`${d.count}`}
            selected={d.id === deckId}
            onPress={() => {
              setDeckId(d.id)
              setDeckSheet(false)
            }}
          />
        ))}
      </Sheet>

      <Sheet
        open={filterSheet}
        onClose={() => setFilterSheet(false)}
        title="Filter"
        footer={
          <View style={[styles.row, { gap: spacing.sm }]}>
            {filtered ? (
              <Button
                label="Reset"
                variant="soft"
                onPress={() => {
                  setFilter('all')
                  setSort('newest')
                }}
                style={styles.grow}
              />
            ) : null}
            <Button label="Done" onPress={() => setFilterSheet(false)} style={styles.grow} />
          </View>
        }
      >
        <Text style={[type.small, styles.group, { color: colors.muted, paddingHorizontal: spacing.lg }]}>Show</Text>
        {FILTERS.map(([f, label]) => (
          <OptionRow key={f} label={label} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
        <Text style={[type.small, styles.group, { color: colors.muted, paddingHorizontal: spacing.lg, paddingTop: spacing.lg }]}>Sort</Text>
        {SORTS.map(([s, label]) => (
          <OptionRow key={s} label={label} selected={sort === s} onPress={() => setSort(s)} />
        ))}
      </Sheet>

      <Sheet open={menu} onClose={() => setMenu(false)} title="Cards">
        <MenuRow
          icon={<Plus size={20} strokeWidth={1.8} color={colors.ink} />}
          label="Quick add a card"
          onPress={() => {
            setMenu(false)
            setAdd(true)
          }}
        />
        <MenuRow
          icon={<Plus size={20} strokeWidth={1.8} color={colors.ink} />}
          label="New card with every field"
          accessibilityLabel="New card"
          onPress={() => {
            setMenu(false)
            router.push({ pathname: '/card/edit', params: { deckId: targetDeck } })
          }}
        />
        <MenuRow
          icon={<History size={20} strokeWidth={1.8} color={colors.ink} />}
          label="Practice history"
          onPress={() => {
            setMenu(false)
            router.push('/practice-history')
          }}
        />
        <MenuRow
          icon={<Upload size={20} strokeWidth={1.8} color={colors.ink} />}
          label="Import cards from CSV"
          accessibilityLabel="Import CSV"
          onPress={() => {
            setMenu(false)
            router.push({ pathname: '/import-csv', params: { deckId: targetDeck } })
          }}
        />
      </Sheet>

      <QuickAddSheet open={add} onClose={() => setAdd(false)} deckId={deck?.id ?? decks[0]?.id} onAdd={(input) => quickAddCard(library, input)} deckName={(deck ?? decks[0])?.name}
        onFull={
          targetDeck
            ? () => {
                setAdd(false)
                router.push({ pathname: '/card/edit', params: { deckId: targetDeck } })
              }
            : undefined
        }
      />
      <PractiseSheet open={practise} onClose={() => setPractise(false)} deckId={deck?.id} />
    </View>
  )
}

const cardKey = (c: Card) => c.id

/** One row of the card list, which reads as one white grouped list: the picture, the German with a coloured article, the English. */
const CardRow = memo(function CardRow({ card, first, last, onOpen }: { card: Card; first: boolean; last: boolean; onOpen: (id: string) => void }) {
  const { colors, type, spacing, radius, topics, fonts } = useTheme()
  const incomplete = card.tags.includes(INCOMPLETE_TAG)
  const r = radius.block + 4
  return (
    <Pressable
      onPress={() => onOpen(card.id)}
      scaleTo={1}
      android_ripple={{ color: colors.line }}
      accessibilityRole="button"
      accessibilityLabel={`${germanText(card)}, ${card.english}`}
      style={[
        styles.row,
        styles.clip,
        { backgroundColor: colors.card, paddingVertical: 10, paddingLeft: spacing.md, paddingRight: spacing.md, gap: spacing.md },
        first && { borderTopLeftRadius: r, borderTopRightRadius: r, paddingTop: 12 },
        last && { borderBottomLeftRadius: r, borderBottomRightRadius: r, paddingBottom: 12 },
      ]}
    >
      {first ? null : <View style={[styles.rowLine, { backgroundColor: colors.line, left: spacing.md + 52 + spacing.md }]} />}
      <CardPicture card={card} height={52} emojiSize={26} style={{ width: 52, borderRadius: 14 }} />
      <View style={[styles.grow, { gap: 2 }]}>
        <GermanLine card={card} numberOfLines={2} style={[type.bodyMedium, { color: colors.ink }]} />
        <Text style={[type.small, { color: colors.muted }]} numberOfLines={1}>
          {card.english}
          {incomplete ? <Text style={{ color: topics.sand.ink, fontFamily: fonts.semibold }}>{'  ·  Incomplete'}</Text> : null}
        </Text>
      </View>
      <ChevronRight size={18} strokeWidth={1.8} color={colors.muted} />
    </Pressable>
  )
})

function MenuRow({ icon, label, onPress, accessibilityLabel }: { icon: React.ReactNode; label: string; onPress: () => void; accessibilityLabel?: string }) {
  const { colors, type, spacing, radius } = useTheme()
  return (
    <Pressable onPress={onPress} scaleTo={0.98} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} style={[styles.row, { minHeight: 60, paddingHorizontal: spacing.md, gap: spacing.md, borderRadius: radius.row }]}>
      <Tile bg={colors.raised}>{icon}</Tile>
      <Text style={[type.bodyMedium, styles.grow, { color: colors.ink }]}>{label}</Text>
      <ChevronRight size={18} strokeWidth={1.8} color={colors.muted} />
    </Pressable>
  )
}

function QuickAddSheet({ open, onClose, deckId, deckName, onAdd, onFull }: { open: boolean; onClose: () => void; deckId?: string; deckName?: string; onAdd: (input: { english: string; german: string; deckId: string }) => void; onFull?: () => void }) {
  const { spacing, colors, type } = useTheme()
  const [english, setEnglish] = useState('')
  const [german, setGerman] = useState('')
  const submit = () => {
    if (!deckId || !english.trim() || !german.trim()) return
    onAdd({ english, german, deckId })
    setEnglish('')
    setGerman('')
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Quick add"
      footer={
        <View style={[styles.row, { gap: spacing.sm }]}>
          <Button label="Add" onPress={submit} haptic="tap" disabled={!english.trim() || !german.trim()} style={styles.grow} />
          <Button label="Done" variant="soft" onPress={onClose} style={styles.grow} />
        </View>
      }
    >
      <View style={{ gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.xs }}>
        <Text style={[type.small, { color: colors.muted }]}>{`Goes into ${deckName ?? 'your deck'}, marked incomplete. Add the rest later.`}</Text>
        <Field label="English" value={english} onChangeText={setEnglish} autoCapitalize="none" autoFocus />
        <Field label="German (with article if a noun)" value={german} onChangeText={setGerman} autoCapitalize="none" onSubmitEditing={submit} />
        {onFull ? (
          <Pressable onPress={onFull} scaleTo={0.97} accessibilityRole="button" accessibilityLabel="Open the full editor" hitSlop={8} style={{ alignSelf: 'flex-start' }}>
            <Text style={[type.small, { color: colors.ink2, textDecorationLine: 'underline' }]}>Need a picture or forms? Open the full editor</Text>
          </Pressable>
        ) : null}
      </View>
    </Sheet>
  )
}

/** Practise a deck (or all): which directions, then every card of the deck in a round. */
function PractiseSheet({ open, onClose, deckId }: { open: boolean; onClose: () => void; deckId?: string }) {
  const { spacing, colors, type } = useTheme()
  const router = useRouter()
  const decks = useDecks()
  const cards = useCards()
  const available = useMemo(() => {
    const chosen = deckId ? decks.filter((d) => d.id === deckId) : decks
    const set = new Set<Direction>()
    for (const c of cards) {
      const d = chosen.find((x) => x.id === c.deckId)
      if (d) for (const dir of directionsFor(c, d)) set.add(dir)
    }
    return ALL_DIRECTIONS.filter((d) => set.has(d))
  }, [cards, decks, deckId])
  const [off, setOff] = useState<Direction[]>([])
  const picked = available.filter((d) => !off.includes(d))
  const start = () => {
    onClose()
    const params: Record<string, string> = { cards: 'all' }
    if (deckId) params.decks = deckId
    if (picked.length && picked.length < available.length) params.dirs = picked.join(',')
    router.push({ pathname: '/practice', params })
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Practise ${deckId ? (decks.find((d) => d.id === deckId)?.name ?? 'deck') : 'all decks'}`}
      footer={<Button label="Start" size="lg" icon={<Play size={15} color={colors.onPrimary} fill={colors.onPrimary} />} disabled={picked.length === 0} onPress={start} haptic="tap" />}
    >
      <View style={{ gap: spacing.md, paddingHorizontal: spacing.md }}>
        <Text style={[type.small, { color: colors.muted }]}>Every card, rated Again, Hard, Good or Easy. Easy finishes a card for the round.</Text>
        <View style={[styles.row, { flexWrap: 'wrap', gap: spacing.sm }]}>
          {available.map((d) => (
            <Chip key={d} label={DIRECTION_LABEL[d]} selected={!off.includes(d)} onPress={() => setOff(off.includes(d) ? off.filter((x) => x !== d) : [...off, d])} />
          ))}
        </View>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  deckCard: { flex: 1, height: 64, flexDirection: 'row', alignItems: 'center' },
  search: { height: 48, flexDirection: 'row', alignItems: 'center' },
  clip: { overflow: 'hidden' },
  chipWrap: { alignSelf: 'flex-start' },
  chip: { height: 32, paddingLeft: 14, paddingRight: 10 },
  group: { paddingBottom: 4 },
  rowLine: { position: 'absolute', top: 0, right: 0, height: StyleSheet.hairlineWidth },
  fab: { position: 'absolute', height: 56, paddingHorizontal: 24, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
})
