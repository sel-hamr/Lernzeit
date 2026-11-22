import { parseCardsCsv, type CsvPreview } from '@lernzeit/core/csv'
import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { FileUp } from 'lucide-react-native'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { Screen } from '../components/Screen'
import { useLocalLibrary } from '../store/live'
import { useTheme } from '../theme'
import { Button, SelectRow } from '../ui'
import { importCsvRows } from './csvImport'
import { useDecks } from './data'

const COLUMNS = 'english, german, gender, plural, example_de, example_en, tags, deck, emoji (also type, verb_forms, present, past, perfect). Only english and german are needed.'

/** Import cards from a CSV file: pick it, see what it holds, choose the deck for rows without one. */
export function ImportCsv() {
  const { deckId } = useLocalSearchParams<{ deckId?: string }>()
  const library = useLocalLibrary()
  const router = useRouter()
  const decks = useDecks()
  const { colors, type, spacing } = useTheme()
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
      setMessage(`Imported ${done.cards} cards${done.newDecks ? ` and ${done.newDecks} new ${done.newDecks === 1 ? 'deck' : 'decks'}` : ''}.`)
      setPreview(undefined)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'The import failed.')
    }
  }
  return (
    <Screen title="Import cards">
      <View style={{ gap: spacing.md }}>
        <Text style={[type.body, { color: colors.muted }]}>{`Columns: ${COLUMNS}`}</Text>
        <Button label="Choose a CSV file" variant="outline" icon={<FileUp size={16} color={colors.ink} />} onPress={() => void pick()} />
        {preview ? (
          <>
            <Text style={[type.bodyMedium, { color: colors.ink }]}>{`${name}: ${preview.rows.length} cards ready${preview.skipped.length ? `, ${preview.skipped.length} rows skipped` : ''}`}</Text>
            {preview.deckNames.length ? <Text style={[type.small, { color: colors.muted }]}>{`Decks in the file: ${preview.deckNames.join(', ')}`}</Text> : null}
            {preview.skipped.slice(0, 5).map((s) => (
              <Text key={s.line} style={[type.small, { color: colors.redInk }]}>{`Line ${s.line}: ${s.reason}`}</Text>
            ))}
            <SelectRow label="Deck for rows without one" value={deck} display={decks.find((d) => d.id === deck)?.name ?? 'No deck'} options={decks.map((d) => ({ value: d.id, label: d.name }))} onChange={setDeck} />
            <Button label={`Import ${preview.rows.length} cards`} disabled={preview.rows.length === 0 || (!deck && decks.length === 0 && preview.rows.some((r) => !r.deck))} onPress={run} />
          </>
        ) : null}
        {message ? (
          <Text style={[type.body, { color: colors.sageInk }]} accessibilityLiveRegion="polite">
            {message}
          </Text>
        ) : null}
        {message?.startsWith('Imported') ? <Button label="Back to cards" variant="outline" onPress={() => router.dismissTo('/flashcards')} /> : null}
      </View>
    </Screen>
  )
}
