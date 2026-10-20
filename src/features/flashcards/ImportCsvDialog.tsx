import { useState } from 'react'
import { Download, FileUp } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import { CardGerman } from '@/components/GermanWord'
import { useDecks, useLanguage } from '@/data/hooks'
import {
  CSV_TEMPLATE,
  downloadFile,
  importCsvRows,
  parseCardPack,
  parseCardsCsv,
  prepareCardPack,
  writeCardPack,
  type CardPack,
  type CsvPreview,
} from '@/data/io'
import { count } from '@/lib/text'
import type { CardType, Gender } from '@/db/types'

type Loaded = { kind: 'csv'; preview: CsvPreview } | { kind: 'pack'; pack: CardPack }

interface PreviewRow {
  type: CardType
  german: string
  gender?: Gender
  english: string
  plural?: string
  emoji?: string
  partOfSpeech?: string
  deck: string
}

/** Import a CSV file or a Lernzeit card pack (.json). */
export function ImportCsvDialog({ open, onClose, defaultDeckId }: { open: boolean; onClose: () => void; defaultDeckId?: string }) {
  return (
    <Dialog open={open} onClose={onClose} title="Import cards" description="A CSV file (english, german, gender, plural, example_de, example_en, tags, deck, emoji) or a Lernzeit card pack (.json)." size="lg">
      {open && <ImportForm onDone={onClose} defaultDeckId={defaultDeckId} />}
    </Dialog>
  )
}

function ImportForm({ onDone, defaultDeckId }: { onDone: () => void; defaultDeckId?: string }) {
  const language = useLanguage()
  const decks = useDecks()
  const { toast } = useFeedback()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [deckId, setDeckId] = useState(defaultDeckId ?? '')
  const [busy, setBusy] = useState(false)
  const fallback = decks.some((d) => d.id === deckId) ? deckId : (decks[0]?.id ?? '')

  const load = async (file: File) => {
    setFileName(file.name)
    setError('')
    setLoaded(null)
    const text = await file.text()
    try {
      if (file.name.toLowerCase().endsWith('.json') || text.trimStart().startsWith('{')) {
        setLoaded({ kind: 'pack', pack: parseCardPack(JSON.parse(text)) })
      } else {
        setLoaded({ kind: 'csv', preview: parseCardsCsv(text) })
      }
    } catch (err) {
      setError(err instanceof SyntaxError ? 'That JSON file could not be read' : err instanceof Error ? err.message : 'That file could not be read')
    }
  }

  const run = async () => {
    if (!loaded) return
    setBusy(true)
    try {
      if (loaded.kind === 'csv') {
        const result = await importCsvRows(loaded.preview.rows, fallback)
        toast(`Imported ${count(result.cards, 'card')}${result.newDecks ? ` and created ${count(result.newDecks, 'deck')}` : ''}`)
      } else {
        const result = await writeCardPack(await prepareCardPack(loaded.pack))
        const parts = [`Imported ${count(result.cards, 'card')}`]
        if (result.newDecks) parts.push(`created ${count(result.newDecks, 'deck')}`)
        if (result.skipped) parts.push(`${result.skipped} already there`)
        toast(parts.join(', '))
      }
      onDone()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import failed', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const rows: PreviewRow[] =
    loaded?.kind === 'csv'
      ? loaded.preview.rows.map((r) => ({ type: r.type, german: r.german, gender: r.gender, english: r.english, plural: r.plural, emoji: r.emoji, deck: r.deck ?? '—' }))
      : loaded?.kind === 'pack'
        ? loaded.pack.cards.map((c) => ({
            type: c.type ?? 'word',
            german: c.german,
            gender: c.gender ?? undefined,
            english: c.english,
            plural: c.plural ?? undefined,
            emoji: c.emoji ?? undefined,
            partOfSpeech: c.partOfSpeech ?? undefined,
            deck: loaded.pack.decks.find((d) => d.id === c.deckId)?.name ?? c.deckId,
          }))
        : []
  const unknownDecks =
    loaded?.kind === 'csv'
      ? loaded.preview.deckNames.filter((n) => !decks.some((d) => d.name.toLowerCase() === n.toLowerCase()))
      : loaded?.kind === 'pack'
        ? loaded.pack.decks.filter((pd) => !decks.some((d) => d.id === pd.id || d.name.toLowerCase() === pd.name.toLowerCase())).map((d) => d.name)
        : []

  return (
    <div className="flex flex-col gap-5">
      <label
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-img border border-dashed border-line-strong px-6 py-8 text-center text-small text-muted transition-colors hover:bg-soft"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const file = e.dataTransfer.files[0]
          if (file) void load(file)
        }}
      >
        <FileUp size={22} strokeWidth={1.6} />
        {fileName ? (
          <span>
            <span className="font-medium text-ink">{fileName}</span> · choose another file
          </span>
        ) : (
          <span>
            <span className="font-medium text-ink">Choose a .csv or .json file</span> or drop it here
          </span>
        )}
        <input type="file" accept=".csv,text/csv,.json,application/json" hidden onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])} />
      </label>

      {error && <div className="rounded-row bg-red-soft px-4 py-3 text-small text-red-ink">{error}</div>}

      {loaded?.kind !== 'pack' && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Field label="Rows without a deck go to" htmlFor="csv-deck" className="min-w-55 flex-1">
            <Select id="csv-deck" value={fallback} onChange={(e) => setDeckId(e.target.value)}>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="ghost" size="sm" icon={<Download size={15} strokeWidth={1.8} />} onClick={() => downloadFile('lernzeit-template.csv', CSV_TEMPLATE, 'text/csv')}>
            CSV template
          </Button>
        </div>
      )}

      {loaded && (
        <div className="flex flex-col gap-3">
          <div className="text-small text-ink-2">
            <span className="font-medium text-ink">{count(rows.length, 'card')}</span> ready
            {loaded.kind === 'pack' && loaded.pack.description && <span className="text-muted"> · {loaded.pack.description}</span>}
            {loaded.kind === 'csv' && loaded.preview.skipped.length > 0 && <span className="text-red-ink"> · {loaded.preview.skipped.length} rows skipped</span>}
            {unknownDecks.length > 0 && <span> · new decks: {unknownDecks.join(', ')}</span>}
          </div>
          {rows.length > 0 && (
            <div className="max-h-55 overflow-auto rounded-img border border-line">
              <table className="w-full text-left text-small">
                <thead className="sticky top-0 bg-soft text-chip text-muted">
                  <tr>
                    <th className="w-10 px-3 py-2 font-medium" aria-label="Picture" />
                    <th className="px-3 py-2 font-medium">{language.name}</th>
                    <th className="px-3 py-2 font-medium">{language.native.name}</th>
                    <th className="hidden px-3 py-2 font-medium sm:table-cell">Deck</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 60).map((r, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-3 py-1.5 text-center font-emoji text-[18px]">{r.emoji}</td>
                      <td className="px-3 py-1.5 font-medium">
                        <CardGerman card={r} />
                      </td>
                      <td className="px-3 py-1.5">{r.english}</td>
                      <td className="hidden px-3 py-1.5 text-muted sm:table-cell">{r.deck}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {loaded.kind === 'csv' && loaded.preview.skipped.length > 0 && (
            <ul className="text-chip text-muted">
              {loaded.preview.skipped.slice(0, 5).map((s, i) => (
                <li key={i}>
                  Line {s.line}: {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!rows.length || busy} onClick={() => void run()}>
          {busy ? 'Importing…' : `Import ${rows.length ? count(rows.length, 'card') : ''}`}
        </Button>
      </div>
    </div>
  )
}
