import { germanText } from '@lernzeit/core/german'
import { directionsFor } from '@lernzeit/core/srs'
import { ALL_DIRECTIONS } from '@lernzeit/core/practice'
import type { Card, Direction } from '@lernzeit/core/types'
import { useRouter } from 'expo-router'
import { ChevronDown, Ellipsis, History, Plus, Play, Upload } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import { useLocalLibrary } from '../store/live'
import { useTheme } from '../theme'
import { Button, Chip, Field, Sheet } from '../ui'
import { CardPicture, GermanLine } from './CardPicture'
import { INCOMPLETE_TAG, quickAddCard, useCards, useDecks } from './data'

type Filter = 'all' | 'incomplete' | 'nopicture'
type Sort = 'newest' | 'oldest' | 'german' | 'english'
const SORTS: [Sort, string][] = [
  ['newest', 'Newest'],
  ['oldest', 'Oldest'],
  ['german', 'German A-Z'],
  ['english', 'English A-Z'],
]
const DIRECTION_LABEL: Record<Direction, string> = { imageToDe: 'Picture to German', enToDe: 'English to German', deToEn: 'German to English', cloze: 'Fill the gap' }

/** The Cards tab: a deck button and sheet, search, filter and sort, a grid of cards, quick add and Practise. */
export function CardsScreen() {
  const { colors, type, spacing, radius } = useTheme()
  const router = useRouter()
  const library = useLocalLibrary()
  const decks = useDecks()
  const cards = useCards()
  const [deckId, setDeckId] = useState('all')
  const [deckSheet, setDeckSheet] = useState(false)
  const [menu, setMenu] = useState(false)
  const [practise, setPractise] = useState(false)
  const [add, setAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('newest')

  const deck = decks.find((d) => d.id === deckId)
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
      return !q || [c.english, germanText(c), c.german, ...c.tags].some((t) => t.toLowerCase().includes(q))
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
  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <Text style={[type.title, { color: colors.ink }]} accessibilityRole="header">
        Cards
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
        <Pressable
          onPress={() => setDeckSheet(true)}
          accessibilityRole="button"
          accessibilityLabel={`Deck: ${deck?.name ?? 'All decks'}, ${total} cards`}
          style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, backgroundColor: colors.field, borderRadius: radius.row }}
        >
          <Text style={[type.bodyMedium, { color: colors.ink }]} numberOfLines={1}>{`${deck?.name ?? 'All decks'} · ${total}`}</Text>
          <ChevronDown size={16} strokeWidth={1.7} color={colors.muted} />
        </Pressable>
        <Pressable onPress={() => setMenu(true)} accessibilityRole="button" accessibilityLabel="More" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ellipsis size={20} strokeWidth={1.7} color={colors.ink2} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label="Practise" icon={<Play size={14} color={colors.onDark} fill={colors.onDark} />} disabled={cards.length === 0} onPress={() => setPractise(true)} style={{ flex: 1 }} />
        <Button label="Add card" variant="outline" icon={<Plus size={16} color={colors.ink} />} onPress={() => router.push({ pathname: '/card/edit', params: { deckId: deck?.id ?? decks[0]?.id ?? '' } })} disabled={decks.length === 0} style={{ flex: 1 }} />
      </View>
      <Field value={search} onChangeText={setSearch} placeholder="Search cards" accessibilityLabel="Search cards" autoCapitalize="none" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {(['all', 'incomplete', 'nopicture'] as Filter[]).map((f) => (
          <Chip key={f} label={f === 'all' ? 'All' : f === 'incomplete' ? 'Incomplete' : 'No picture'} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {SORTS.map(([s, label]) => (
          <Chip key={s} label={label} selected={sort === s} onPress={() => setSort(s)} />
        ))}
      </View>
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: colors.main }}>
      <FlatList
        data={shown}
        keyExtractor={(c) => c.id}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing.md }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <Text style={[type.body, { color: colors.muted, paddingVertical: spacing.xl, textAlign: 'center' }]}>
            {cards.length === 0 ? 'No cards yet. Add one, or import a CSV from the menu.' : 'No cards match.'}
          </Text>
        }
        contentContainerStyle={{ paddingHorizontal: spacing.pageX, paddingTop: spacing.pageTop, paddingBottom: 96, gap: spacing.md }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/card/${item.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${germanText(item)}, ${item.english}`}
            style={{ flex: 1, maxWidth: '50%', borderWidth: 1, borderColor: colors.line, borderRadius: radius.flash, padding: spacing.sm, gap: spacing.sm, backgroundColor: colors.main }}
          >
            <CardPicture card={item} height={96} />
            <View style={{ paddingHorizontal: 4, paddingBottom: 4 }}>
              <GermanLine card={item} style={[type.bodyMedium, { color: colors.ink }]} />
              <Text style={[type.small, { color: colors.muted }]} numberOfLines={1}>
                {item.english}
              </Text>
            </View>
          </Pressable>
        )}
      />
      <Pressable
        onPress={() => setAdd(true)}
        disabled={decks.length === 0}
        accessibilityRole="button"
        accessibilityLabel="Quick add a card"
        style={{ position: 'absolute', right: spacing.lg, bottom: spacing.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.buttonDark, alignItems: 'center', justifyContent: 'center', opacity: decks.length ? 1 : 0.4 }}
      >
        <Plus size={24} color={colors.onDark} />
      </Pressable>

      <Sheet open={deckSheet} onClose={() => setDeckSheet(false)} title="Deck">
        {[{ id: 'all', name: 'All decks', count: cards.length }, ...decks.map((d) => ({ id: d.id, name: d.name, count: counts.get(d.id) ?? 0 }))].map((d) => (
          <Pressable
            key={d.id}
            onPress={() => {
              setDeckId(d.id)
              setDeckSheet(false)
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: d.id === deckId }}
            accessibilityLabel={`${d.name}, ${d.count} cards`}
            style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, backgroundColor: d.id === deckId ? colors.field : 'transparent', borderRadius: radius.img }}
          >
            <Text style={[d.id === deckId ? type.bodyMedium : type.body, { color: colors.ink }]}>{d.name}</Text>
            <Text style={[type.small, { color: colors.muted }]}>{d.count}</Text>
          </Pressable>
        ))}
      </Sheet>

      <Sheet open={menu} onClose={() => setMenu(false)}>
        <Pressable
          onPress={() => {
            setMenu(false)
            router.push('/practice-history')
          }}
          accessibilityRole="button"
          accessibilityLabel="Practice history"
          style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md }}
        >
          <History size={18} strokeWidth={1.7} color={colors.ink2} />
          <Text style={[type.body, { color: colors.ink }]}>Practice history</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setMenu(false)
            router.push({ pathname: '/import-csv', params: { deckId: deck?.id ?? decks[0]?.id ?? '' } })
          }}
          accessibilityRole="button"
          accessibilityLabel="Import CSV"
          style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md }}
        >
          <Upload size={18} strokeWidth={1.7} color={colors.ink2} />
          <Text style={[type.body, { color: colors.ink }]}>Import cards from CSV</Text>
        </Pressable>
      </Sheet>

      <QuickAddSheet open={add} onClose={() => setAdd(false)} deckId={deck?.id ?? decks[0]?.id} onAdd={(input) => quickAddCard(library, input)} deckName={(deck ?? decks[0])?.name} />
      <PractiseSheet open={practise} onClose={() => setPractise(false)} deckId={deck?.id} />
    </View>
  )
}

function QuickAddSheet({ open, onClose, deckId, deckName, onAdd }: { open: boolean; onClose: () => void; deckId?: string; deckName?: string; onAdd: (input: { english: string; german: string; deckId: string }) => void }) {
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
    <Sheet open={open} onClose={onClose} title="Quick add">
      <View style={{ gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
        <Text style={[type.small, { color: colors.muted }]}>{`Goes into ${deckName ?? 'your deck'}, marked incomplete. Add the rest later.`}</Text>
        <Field label="English" value={english} onChangeText={setEnglish} autoCapitalize="none" autoFocus />
        <Field label="German (with article if a noun)" value={german} onChangeText={setGerman} autoCapitalize="none" onSubmitEditing={submit} />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label="Add" onPress={submit} />
          <Button label="Done" variant="outline" onPress={onClose} />
        </View>
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
    <Sheet open={open} onClose={onClose} title={`Practise ${deckId ? (decks.find((d) => d.id === deckId)?.name ?? 'deck') : 'all decks'}`}>
      <View style={{ gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
        <Text style={[type.small, { color: colors.muted }]}>Every card, rated Again, Hard, Good or Easy. Easy finishes a card for the round.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {available.map((d) => (
            <Chip key={d} label={DIRECTION_LABEL[d]} selected={!off.includes(d)} onPress={() => setOff(off.includes(d) ? off.filter((x) => x !== d) : [...off, d])} />
          ))}
        </View>
        <Button label="Start" disabled={picked.length === 0} onPress={start} />
      </View>
    </Sheet>
  )
}
