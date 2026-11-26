/*
 * Write a story with AI, as the web's dialog (AiStoryDialog): Claude cannot read your cards, so the
 * words of the decks you pick go into a prompt. The web copies it; the phone shares it, to the
 * Claude app or anywhere you can paste. Claude saves the story with create_story and it syncs here.
 */
import { AI_TAG } from '@lernzeit/core/actions'
import { STORY_LEVELS } from '@lernzeit/core/stories'
import { buildStoryPrompt, isPromptWord, pickPromptWords, storyWordCount, type StoryLength } from '@lernzeit/core/storyPrompt'
import { FEATURED_THEMES, pickTheme } from '@lernzeit/core/storyThemes'
import type { StoryLevel } from '@lernzeit/core/types'
import { Check, Share2 } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { Share, StyleSheet, Text, View } from 'react-native'
import { useCards, useDecks } from '../cards/data'
import { haptics } from '../motion'
import { useTheme } from '../theme'
import { Button, Chip, Field, Sheet } from '../ui'
import { useStories, useVocabulary } from './data'

const LENGTHS: { value: StoryLength; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'medium', label: 'Medium' },
  { value: 'long', label: 'Long' },
]

export function AiStorySheet({ open, onClose, onRead }: { open: boolean; onClose: () => void; onRead: (storyId: string) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Write a story with AI">
      {open ? <AiStoryForm onClose={onClose} onRead={onRead} /> : null}
    </Sheet>
  )
}

function AiStoryForm({ onClose, onRead }: { onClose: () => void; onRead: (storyId: string) => void }) {
  const { colors, type, spacing, radius } = useTheme()
  const decks = useDecks()
  const cards = useCards()
  const vocabulary = useVocabulary()
  const stories = useStories()
  const [openedAt] = useState(() => Date.now())
  const [deckIds, setDeckIds] = useState<string[]>([])
  const [level, setLevel] = useState<StoryLevel>('A1')
  const [length, setLength] = useState<StoryLength>('short')
  const [theme, setTheme] = useState('')
  const [shared, setShared] = useState(false)

  const perDeck = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of cards) if (isPromptWord(c)) m.set(c.deckId, (m.get(c.deckId) ?? 0) + 1)
    return m
  }, [cards])
  const words = useMemo(() => {
    const ids = new Set(deckIds)
    return pickPromptWords(
      cards.filter((c) => !ids.size || ids.has(c.deckId)),
      (id) => vocabulary.knowledge.get(id),
    )
  }, [cards, deckIds, vocabulary])
  const prompt = buildStoryPrompt({ level, length, theme, words })
  const arrived = stories.find((s) => s.createdAt >= openedAt && s.tags.includes(AI_TAG))
  const wordCount = words.familiar.length + words.upcoming.length

  const share = async () => {
    try {
      const result = await Share.share({ message: prompt })
      if (result.action !== Share.dismissedAction) {
        setShared(true)
        haptics.success()
      }
    } catch {
      // Nothing was shared; the button stays.
    }
  }

  const toggleDeck = (id: string) => setDeckIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  const label = (text: string) => <Text style={[type.small, { color: colors.muted, paddingHorizontal: 4 }]}>{text}</Text>

  return (
    <View style={{ gap: spacing.lg, paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
      <Text style={[type.body, { color: colors.muted }]}>Claude writes a story with the words of the decks you choose and saves it to your library.</Text>
      <View style={{ gap: spacing.sm }}>
        {label(`Words from · ${wordCount} ${wordCount === 1 ? 'word' : 'words'}`)}
        <View style={styles.wrap}>
          <Chip label="All decks" selected={deckIds.length === 0} onPress={() => setDeckIds([])} />
          {decks.map((d) => (
            <Chip key={d.id} label={`${d.name} · ${perDeck.get(d.id) ?? 0}`} selected={deckIds.includes(d.id)} onPress={() => toggleDeck(d.id)} />
          ))}
        </View>
      </View>
      <View style={{ gap: spacing.sm }}>
        {label('Level')}
        <View style={styles.wrap}>
          {STORY_LEVELS.map((l) => (
            <Chip key={l} label={l} selected={level === l} onPress={() => setLevel(l)} />
          ))}
        </View>
      </View>
      <View style={{ gap: spacing.sm }}>
        {label('Length in words')}
        <View style={styles.wrap}>
          {LENGTHS.map((l) => (
            <Chip key={l.value} label={`${l.label} · ${storyWordCount(level, l.value)}`} selected={length === l.value} onPress={() => setLength(l.value)} />
          ))}
        </View>
      </View>
      <View style={{ gap: spacing.sm }}>
        <Field label="Theme (optional)" value={theme} onChangeText={setTheme} multiline maxLength={400} placeholder="Two friends who get lost on a hike" />
        <View style={styles.wrap}>
          {FEATURED_THEMES.map((t) => (
            <Chip key={t.name} label={t.name} selected={theme.trim() === t.scene} onPress={() => setTheme(pickTheme(theme, t.scene))} />
          ))}
        </View>
      </View>
      <View style={{ gap: spacing.md, backgroundColor: colors.raised, borderRadius: radius.block, padding: spacing.lg }}>
        <Step n={1} done={shared} text="Share the prompt to the Claude app (or copy it from the share sheet)." />
        <Step n={2} text="Send it in Claude." />
        <Step n={3} done={!!arrived} text={arrived ? `${arrived.title} is here.` : 'Claude saves the story to your library. It shows here once it has synced.'} />
        {arrived ? (
          <Button
            label="Read it"
            onPress={() => {
              onClose()
              onRead(arrived.id)
            }}
          />
        ) : (
          <Button label={shared ? 'Share again' : 'Share prompt'} icon={<Share2 size={16} strokeWidth={1.9} color={colors.onPrimary} />} onPress={() => void share()} haptic="tap" />
        )}
      </View>
    </View>
  )
}

function Step({ n, text, done }: { n: number; text: string; done?: boolean }) {
  const { colors, type, spacing } = useTheme()
  return (
    <View style={[styles.row, { gap: spacing.md }]}>
      <View style={[styles.step, { backgroundColor: done ? colors.accent : colors.card }]}>
        {done ? <Check size={14} strokeWidth={2.6} color={colors.onAccent} /> : <Text style={[type.chip, { color: colors.ink }]}>{n}</Text>}
      </View>
      <Text style={[type.body, styles.grow, { color: colors.ink }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  step: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
})
