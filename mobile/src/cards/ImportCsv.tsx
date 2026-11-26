import { parseCardsCsv, type CsvPreview } from '@lernzeit/core/csv'
import { count } from '@lernzeit/core/text'
import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Check, FileSpreadsheet, FileUp } from 'lucide-react-native'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Screen } from '../components/Screen'
import { FadeInUp, haptics } from '../motion'
import { useLocalLibrary } from '../store/live'
import { numbers, useTheme } from '../theme'
import { Badge, Button, Card, SelectRow, Tile } from '../ui'
import { importCsvRows } from './csvImport'
import { useDecks } from './data'

const COLUMNS = 'english, german, gender, plural, example_de, example_en, tags, deck, emoji (also type, verb_forms, present, past, perfect). Only english and german are needed.'

/** Import cards from a CSV file: pick it, see what it holds, choose the deck for rows without one. */
export function ImportCsv() {
  const { deckId } = useLocalSearchParams<{ deckId?: string }>()
  const library = useLocalLibrary()
  const router = useRouter()
  const decks = useDecks()
  const { colors, type, spacing, radius, fonts } = useTheme()
  const [deck, setDeck] = useState(deckId && decks.some((d) => d.id === deckId) ? String(deckId) : (decks[0]?.id ?? ''))
  const [preview, setPreview] = useState<CsvPreview>()
  const [name, setName] = useState('')
  const [message, setMessage] = useState<string>()

  const pick = async () => {
    setMessage(undefined)
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'], copyToCacheDirectory: true })
      const asset = result.canceled ? undefined : result.assets[0]
      if (!asset) return
      setPreview(parseCardsCsv(await new File(asset.uri).text()))
      setName(asset.name)
    } catch {
      setMessage('Could not read that file.')
    }
  }
  const run = () => {
    if (!preview) return
    try {
      const done = importCsvRows(library, preview.rows, deck)
      setMessage(`Imported ${count(done.cards, 'card')}${done.newDecks ? ` and ${count(done.newDecks, 'new deck')}` : ''}.`)
      setPreview(undefined)
      haptics.success()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'The import failed.')
    }
  }
  const imported = message?.startsWith('Imported')
  return (
    <Screen
      title="Import cards"
      footer={
        preview ? (
          <Button label={`Import ${count(preview.rows.length, 'card')}`} size="lg" disabled={preview.rows.length === 0 || (!deck && decks.length === 0 && preview.rows.some((r) => !r.deck))} onPress={run} />
        ) : imported ? (
          <Button label="Back to cards" size="lg" onPress={() => router.dismissTo('/flashcards')} />
        ) : undefined
      }
    >
      <FadeInUp index={0}>
        <Card>
          <View style={[styles.row, { gap: spacing.md }]}>
            <Tile bg={colors.accentSoft} size={48}>
              <FileSpreadsheet size={22} strokeWidth={1.8} color={colors.accentInk} />
            </Tile>
            <View style={[styles.grow, { gap: 2 }]}>
              <Text style={[type.section, { color: colors.ink }]}>A CSV file of cards</Text>
              <Text style={[type.small, { color: colors.muted }]}>One card per row, a header row first</Text>
            </View>
          </View>
          <Text style={[type.body, { color: colors.ink2 }]}>{`Columns: ${COLUMNS}`}</Text>
          <Button label={preview ? 'Choose another file' : 'Choose a CSV file'} variant={preview ? 'soft' : 'primary'} icon={<FileUp size={16} color={preview ? colors.ink : colors.onPrimary} />} onPress={() => void pick()} />
        </Card>
      </FadeInUp>
      {preview ? (
        <FadeInUp index={1}>
          <Card>
            <Text style={[type.small, { color: colors.muted }]} numberOfLines={1}>
              {name}
            </Text>
            <View style={[styles.row, { gap: spacing.sm, alignItems: 'baseline' }]}>
              <Text style={[type.hero, { color: colors.ink }]}>{preview.rows.length}</Text>
              <Text style={[type.bodyMedium, { color: colors.muted }]}>{`${preview.rows.length === 1 ? 'card' : 'cards'} ready${preview.skipped.length ? `, ${count(preview.skipped.length, 'row')} skipped` : ''}`}</Text>
            </View>
            {preview.deckNames.length ? (
              <View style={[styles.row, { gap: spacing.xs, flexWrap: 'wrap' }]}>
                <Text style={[type.small, { color: colors.muted }]}>Decks in the file:</Text>
                {preview.deckNames.map((d) => (
                  <Badge key={d} label={d} tone="neutral" />
                ))}
              </View>
            ) : null}
            {preview.skipped.slice(0, 5).map((s) => (
              <Text key={s.line} style={[type.small, numbers, { color: colors.dangerInk }]}>{`Line ${s.line}: ${s.reason}`}</Text>
            ))}
            <SelectRow label="Deck for rows without one" value={deck} display={decks.find((d) => d.id === deck)?.name ?? 'No deck'} options={decks.map((d) => ({ value: d.id, label: d.name }))} onChange={setDeck} />
          </Card>
        </FadeInUp>
      ) : null}
      {message ? (
        <FadeInUp index={0}>
          <View style={[styles.row, { gap: spacing.md, padding: spacing.lg, borderRadius: radius.block, backgroundColor: imported ? colors.accentSoft : colors.dangerSoft }]}>
            {imported ? <Check size={20} strokeWidth={2.2} color={colors.accentInk} /> : null}
            <Text style={[type.bodyMedium, styles.grow, { color: imported ? colors.accentInk : colors.dangerInk, fontFamily: fonts.medium }]} accessibilityLiveRegion="polite">
              {message}
            </Text>
          </View>
        </FadeInUp>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({ grow: { flex: 1 }, row: { flexDirection: 'row', alignItems: 'center' } })
