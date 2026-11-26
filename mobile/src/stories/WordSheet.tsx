/*
 * What a tapped word is, in a sheet (the web's word panel and note): the AI's note on it (its
 * meaning, and why it has this form in this sentence), then its card, or a form to add it.
 */
import { GENDER_LABEL, germanText, wordKind } from '@lernzeit/core/german'
import { lookupKey, type Knowledge } from '@lernzeit/core/reader'
import { baseFormText, type StoryWordMatch } from '@lernzeit/core/storyWords'
import type { Card } from '@lernzeit/core/types'
import { useRouter } from 'expo-router'
import { ExternalLink, Lightbulb, Plus, Volume2 } from 'lucide-react-native'
import { useState } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { CardPicture, GermanLine } from '../cards/CardPicture'
import { INCOMPLETE_TAG, useDecks } from '../cards/data'
import { Inline } from '../components/RuleText'
import { FadeInUp, haptics } from '../motion'
import { notice } from '../notice'
import { useLocalLibrary } from '../store/live'
import { useTheme } from '../theme'
import { Badge, Button, Chip, Field, IconButton, Sheet } from '../ui'
import { addStoryWord } from './data'
import type { Vocabulary } from './model'

const KNOWLEDGE: Record<Knowledge, { label: string; tone: 'accent' | 'lime' | 'neutral' }> = {
  new: { label: 'New', tone: 'neutral' },
  learning: { label: 'Learning', tone: 'accent' },
  known: { label: 'Known', tone: 'lime' },
}

export interface TappedWord {
  word: string
  sentence: string
  cardIds: string[]
  match?: StoryWordMatch
}

export function WordSheet({ tapped, vocabulary, onClose, onSay }: { tapped: TappedWord | null; vocabulary: Vocabulary; onClose: () => void; onSay: (text: string) => void }) {
  return (
    <Sheet open={!!tapped} onClose={onClose} closeLabel="Close the word">
      {tapped ? <WordPanel key={`${tapped.word}:${tapped.sentence}`} tapped={tapped} vocabulary={vocabulary} onSay={onSay} onClose={onClose} /> : null}
    </Sheet>
  )
}

function WordPanel({ tapped, vocabulary, onSay, onClose }: { tapped: TappedWord; vocabulary: Vocabulary; onSay: (text: string) => void; onClose: () => void }) {
  const { spacing } = useTheme()
  const { word, sentence, cardIds, match } = tapped
  const [addedId, setAddedId] = useState<string>()
  // The "ein" of "steigt ... ein" is part of the verb, whatever cards share its spelling.
  const partOfVerb = match?.here && match.note.alsoTap?.some((part) => lookupKey(part) === lookupKey(word))
  const matched = partOfVerb ? [] : cardIds
  const ids = matched.length ? matched : addedId ? [addedId] : []
  const cards = ids.map((id) => vocabulary.cards.get(id)).filter((c): c is Card => !!c)
  return (
    <View style={{ gap: spacing.lg, paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
      {match ? (
        <FadeInUp index={0}>
          <WordNote word={word} match={match} onSay={onSay} />
        </FadeInUp>
      ) : null}
      {cards.length ? (
        cards.map((card, i) => (
          <FadeInUp key={card.id} index={i + 1}>
            <CardBlock card={card} knowledge={vocabulary.knowledge.get(card.id) ?? 'new'} isForm={cards.every((c) => ![c.german, germanText(c)].some((t) => lookupKey(t) === lookupKey(word)))} word={word} onSay={onSay} onClose={onClose} />
          </FadeInUp>
        ))
      ) : addedId ? null : (
        <FadeInUp index={1}>
          <UnknownWord word={partOfVerb && match ? match.note.baseForm : word} sentence={sentence} match={match} showHeader={!match} onSay={onSay} onAdded={setAddedId} />
        </FadeInUp>
      )}
    </View>
  )
}

function WordNote({ word, match, onSay }: { word: string; match: StoryWordMatch; onSay: (text: string) => void }) {
  const { colors, type, spacing, radius, fonts } = useTheme()
  const { note, here } = match
  // A split verb reads and sounds as one: "steigt ... ein".
  const parts = here && note.alsoTap?.length ? [note.word, ...note.alsoTap] : [word]
  const kind = [note.partOfSpeech, note.gender && GENDER_LABEL[note.gender]].filter(Boolean).join(', ')
  const isBaseForm = lookupKey(note.baseForm) === lookupKey(word)
  const grammar = here ? note.grammar : undefined
  return (
    <View style={{ gap: spacing.md }}>
      <View style={[styles.row, { gap: spacing.md }]}>
        <View style={[styles.grow, { gap: 2 }]}>
          <Text style={[type.title, { color: colors.ink }]}>{parts.join(' … ')}</Text>
          <Text style={[type.section, { color: colors.accentInk }]}>{note.translation}</Text>
          <Text style={[type.small, { color: colors.muted }]}>{[kind, !isBaseForm && baseFormText(note)].filter(Boolean).join(' · ')}</Text>
        </View>
        <IconButton icon={Volume2} label="Play German audio" variant="raised" onPress={() => onSay(parts.join(' '))} />
      </View>
      {note.meaning ? <Inline text={note.meaning} style={[type.body, { color: colors.ink2 }]} /> : null}
      {!here && note.grammar ? <Text style={[type.small, { color: colors.muted }]}>From another sentence in this story.</Text> : null}
      {grammar ? (
        <View style={{ backgroundColor: colors.raised, borderRadius: radius.block, padding: spacing.lg, gap: spacing.sm }}>
          <Text style={[type.chip, { color: colors.muted }]}>Why this form?</Text>
          <Inline text={grammar.rule} style={[type.bodyMedium, { color: colors.ink, fontFamily: fonts.semibold }]} />
          <Inline text={grammar.why} style={[type.small, { color: colors.ink2 }]} />
          <View style={[styles.row, { gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: spacing.sm }]}>
            <View style={styles.grow}>
              <Text style={[type.small, { color: colors.ink, fontFamily: fonts.medium }]}>{grammar.example.text}</Text>
              <Text style={[type.chip, { color: colors.muted }]}>{grammar.example.translation}</Text>
            </View>
            <IconButton icon={Volume2} label="Listen to the example" variant="ghost" size={36} onPress={() => onSay(grammar.example.text)} />
          </View>
        </View>
      ) : null}
      {note.tip ? (
        <View style={[styles.row, { gap: spacing.sm, alignItems: 'flex-start' }]}>
          <Lightbulb size={14} strokeWidth={1.8} color={colors.muted} style={{ marginTop: 2 }} />
          <Inline text={note.tip} style={[type.small, styles.grow, { color: colors.muted }]} />
        </View>
      ) : null}
    </View>
  )
}

function CardBlock({ card, knowledge, isForm, word, onSay, onClose }: { card: Card; knowledge: Knowledge; isForm: boolean; word: string; onSay: (text: string) => void; onClose: () => void }) {
  const { colors, type, spacing, radius } = useTheme()
  const router = useRouter()
  const kind = [wordKind(card), card.gender && GENDER_LABEL[card.gender]].filter(Boolean).join(', ')
  const rows: [string, string][] = []
  if (card.plural) rows.push(['Plural', card.plural])
  if (card.verbForms) rows.push(['Verb forms', card.verbForms])
  if (card.exampleDe) rows.push(['Example', card.exampleDe])
  const chip = KNOWLEDGE[knowledge]
  return (
    <View style={{ gap: spacing.md }}>
      {isForm ? <Text style={[type.small, { color: colors.muted }]}>{`${word} in the story is a form of:`}</Text> : null}
      <CardPicture card={card} height={140} emojiSize={56} style={{ borderRadius: radius.block }} />
      <View style={[styles.row, { gap: spacing.md }]}>
        <View style={[styles.grow, { gap: 2 }]}>
          <GermanLine card={card} style={[type.title, { fontSize: 24, lineHeight: 30, color: colors.ink }]} />
          <Text style={[type.small, { color: colors.muted }]}>{`${card.english} · ${kind}`}</Text>
        </View>
        <IconButton icon={Volume2} label="Play German audio" variant="raised" onPress={() => onSay(germanText(card))} />
      </View>
      <View style={[styles.row, { gap: spacing.xs }]}>
        <Badge label={chip.label} tone={chip.tone} />
        {card.tags.includes(INCOMPLETE_TAG) ? <Badge label="Incomplete" tone="neutral" /> : null}
      </View>
      {rows.length ? (
        <View style={{ gap: spacing.sm }}>
          {rows.map(([label, value]) => (
            <View key={label} style={[styles.row, { gap: spacing.md, alignItems: 'flex-start' }]}>
              <Text style={[type.small, { color: colors.muted, width: 84 }]}>{label}</Text>
              <Text style={[type.small, styles.grow, { color: colors.ink }]}>{value}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Button
        label="Open card"
        variant="soft"
        onPress={() => {
          onClose()
          router.push(`/card/${card.id}`)
        }}
      />
    </View>
  )
}

function UnknownWord({ word, sentence, match, showHeader, onSay, onAdded }: { word: string; sentence: string; match?: StoryWordMatch; showHeader: boolean; onSay: (text: string) => void; onAdded: (id: string) => void }) {
  const { colors, type, spacing, radius } = useTheme()
  const library = useLocalLibrary()
  const decks = useDecks()
  const note = match?.here ? match.note : undefined
  const [german, setGerman] = useState(note ? baseFormText(note) : word)
  const [english, setEnglish] = useState(note?.translation ?? '')
  const [deckId, setDeckId] = useState(decks[0]?.id)
  const ready = !!german.trim() && !!english.trim()
  const add = () => {
    if (!ready) return
    const card = addStoryWord(library, { german, english, deckId, sentence, partOfSpeech: note?.partOfSpeech })
    haptics.success()
    notice(`Added “${germanText(card)}”`)
    onAdded(card.id)
  }
  return (
    <View style={{ gap: spacing.md }}>
      {showHeader ? (
        <View style={[styles.row, { gap: spacing.md }]}>
          <View style={[styles.grow, { gap: 2 }]}>
            <Text style={[type.title, { color: colors.ink }]}>{word}</Text>
            <Text style={[type.small, { color: colors.muted }]}>Not in your decks yet.</Text>
          </View>
          <IconButton icon={Volume2} label="Play German audio" variant="raised" onPress={() => onSay(word)} />
        </View>
      ) : null}
      {/* A note from another sentence may mean something else here, so the dictionary stays one tap away. */}
      {!match?.here ? (
        <Button label="Look it up on LEO" variant="ghost" size="sm" icon={<ExternalLink size={14} strokeWidth={1.8} color={colors.ink} />} onPress={() => void Linking.openURL(`https://dict.leo.org/englisch-deutsch/${encodeURIComponent(word)}`)} style={{ alignSelf: 'flex-start' }} />
      ) : null}
      <View style={{ backgroundColor: colors.raised, borderRadius: radius.block, padding: spacing.lg, gap: spacing.md }}>
        <Text style={[type.bodyMedium, { color: colors.ink }]}>Add it to a deck</Text>
        <Field label="German (the base form, der Hund, gehen)" value={german} onChangeText={setGerman} onCanvas autoCapitalize="none" autoCorrect={false} />
        <Field label="English" value={english} onChangeText={setEnglish} onCanvas placeholder="Meaning" autoCapitalize="none" />
        {decks.length > 1 ? (
          <View style={styles.wrap}>
            {decks.map((d) => (
              <Chip key={d.id} label={d.name} selected={deckId === d.id} onPress={() => setDeckId(d.id)} />
            ))}
          </View>
        ) : null}
        <Text style={[type.chip, { color: colors.muted }]}>
          {'Example from the story: '}
          <Text style={{ color: colors.ink2 }}>{sentence}</Text>
        </Text>
        <Button label="Add card" icon={<Plus size={16} strokeWidth={2} color={colors.onPrimary} />} disabled={!ready} onPress={add} haptic="tap" />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
