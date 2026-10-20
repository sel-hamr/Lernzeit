import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Check } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Segmented, Select } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import { useSettings } from '@/data/hooks'
import { installLanguage } from '@/data/languages'
import type { StoryLevel } from '@/db/types'
import { endonym, languageName, levelSummary, loadPack, packInfo, PACKS, type LangCode, type LevelSummary, type PackContent } from '@/languages'
import { count } from '@/lib/text'

export type LanguageDialogMode = 'welcome' | 'level'

/**
 * Picks what to install from the language packs. `welcome` is the first
 * launch: the language you learn, your own and your level. `level` adds
 * another level of the language you already learn.
 */
export function LanguageDialog({ open, onClose, mode }: { open: boolean; onClose: () => void; mode: LanguageDialogMode }) {
  // Mounted only while open, so every opening starts from a fresh choice.
  return open ? <OpenLanguageDialog mode={mode} onClose={onClose} /> : null
}

/** A pack's content, loaded when its language is picked. */
function usePackContent(code: LangCode | undefined): PackContent | undefined {
  const [loaded, setLoaded] = useState<{ code: LangCode; content: PackContent }>()
  useEffect(() => {
    if (!code) return
    let live = true
    loadPack(code)
      .then((content) => {
        if (live) setLoaded({ code, content })
      })
      .catch((err) => console.error('Loading the pack failed', err))
    return () => {
      live = false
    }
  }, [code])
  return code && loaded?.code === code ? loaded.content : undefined
}

/** The browser's language, as a first guess at yours. */
function browserLanguage(): LangCode {
  return typeof navigator === 'undefined' ? 'en' : navigator.language.slice(0, 2).toLowerCase()
}

function describe(summary: LevelSummary): string {
  return [
    count(summary.words, 'word'),
    count(summary.sentences, 'sentence'),
    count(summary.stories, 'story', 'stories'),
    count(summary.questions, 'question'),
    count(summary.grammar, 'grammar topic'),
  ].join(' · ')
}

function OpenLanguageDialog({ mode, onClose }: { mode: LanguageDialogMode; onClose: () => void }) {
  const settings = useSettings()
  const { toast } = useFeedback()
  const fixed = mode === 'level'
  const [picked, setPicked] = useState<LangCode>()
  const [nativePick, setNativePick] = useState<LangCode>(browserLanguage)
  const [levelPick, setLevelPick] = useState<StoryLevel>()
  const [installing, setInstalling] = useState(false)

  const info = packInfo((fixed ? settings.learning : picked) ?? '')
  // A pick that does not fit the language falls back to the first that does.
  const native = fixed ? settings.native : info?.natives.includes(nativePick) ? nativePick : info?.natives[0]
  const levels = info?.levels.filter((l) => !fixed || !settings.levels.includes(l)) ?? []
  const level = levelPick && levels.includes(levelPick) ? levelPick : levels[0]
  const content = usePackContent(info?.code)
  const summary = content && level ? levelSummary(content, level) : undefined

  const start = async () => {
    if (!info || !native || !level) return
    setInstalling(true)
    try {
      const added = await installLanguage({ learning: info.code, native, levels: [level] })
      const parts = [count(added.cards, 'card'), count(added.stories, 'story', 'stories'), count(added.questions, 'question'), count(added.topics, 'grammar topic')]
      toast(`${info.name} ${level}: added ${parts.join(', ')}`)
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not add the language', { tone: 'error' })
    } finally {
      setInstalling(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      locked={installing}
      title={fixed ? 'Add a level' : 'Welcome to Lernzeit'}
      description={fixed ? 'Adds the words, stories, questions and grammar of another level.' : 'What do you want to learn? Lernzeit adds words, stories, questions and grammar for your level.'}
      footer={
        <>
          <Button variant="ghost" disabled={installing} onClick={onClose}>
            {fixed ? 'Cancel' : 'Not now'}
          </Button>
          <Button variant="primary" disabled={!info || !native || !level || installing} onClick={() => void start()}>
            {installing ? 'Adding…' : fixed ? `Add ${level ?? 'level'}` : 'Start learning'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 pt-1">
        {!fixed && (
          <fieldset className="flex flex-col">
            <legend className="mb-1.5 text-small font-medium text-ink-2">I want to learn</legend>
            <div className="grid grid-cols-2 gap-2">
              {PACKS.map((p) => {
                const active = p.code === info?.code
                return (
                  <button
                    key={p.code}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPicked(p.code)}
                    className={clsx(
                      'flex items-center justify-between gap-2 rounded-img border px-3 py-2.5 text-left transition-[border-color,background-color]',
                      active ? 'border-sage-border bg-sage/40' : 'border-line hover:border-line-strong',
                    )}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="text-body font-medium">{p.name}</span>
                      {p.endonym !== p.name && (
                        <span className="truncate text-chip text-muted" lang={p.code} dir="auto">
                          {p.endonym}
                        </span>
                      )}
                    </span>
                    {active && <Check size={16} strokeWidth={2.2} className="shrink-0 text-sage-ink" />}
                  </button>
                )
              })}
            </div>
          </fieldset>
        )}

        {fixed && !info && <p className="text-small text-muted">There is no pack for {languageName(settings.learning)}.</p>}

        {info && native && (
          <Field
            label="My language"
            htmlFor="native-language"
            hint={
              fixed
                ? `Meanings and explanations are in ${languageName(native)}.`
                : info.natives.length === 1
                  ? `The ${info.name} pack explains in ${languageName(native)} for now.`
                  : 'Meanings and explanations are written in it.'
            }
          >
            <Select id="native-language" value={native} disabled={fixed || info.natives.length === 1} onChange={(e) => setNativePick(e.target.value)}>
              {info.natives.map((code) => (
                <option key={code} value={code}>
                  {languageName(code)}
                  {endonym(code) !== languageName(code) ? ` · ${endonym(code)}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {info && level && (
          <div className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-ink-2">My level</span>
            <Segmented label="Level" options={levels.map((l) => ({ value: l, label: l }))} value={level} onChange={setLevelPick} className="self-start" />
            <span className="text-chip text-muted" aria-live="polite">
              {summary ? describe(summary) : 'Loading…'}
            </span>
          </div>
        )}
        {fixed && info && !level && <p className="text-small text-muted">You have every level of the {info.name} pack.</p>}
      </div>
    </Dialog>
  )
}
