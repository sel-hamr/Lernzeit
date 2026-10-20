import { useState } from 'react'
import { Languages, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useHasLearningData, useLanguage, useSettings } from '@/data/hooks'
import { LanguageDialog, type LanguageDialogMode } from '@/features/languages/LanguageDialog'
import { packInfo } from '@/languages'
import { Group } from './Group'

/** The language you learn, from which pack and levels, and adding another level. */
export function LanguageGroup() {
  const settings = useSettings()
  const language = useLanguage()
  const hasData = useHasLearningData()
  const [dialog, setDialog] = useState<LanguageDialogMode | null>(null)
  const missing = packInfo(language.code)?.levels.filter((l) => !settings.levels.includes(l)) ?? []

  return (
    <Group
      title="Language"
      description="To learn another language, export a backup, then delete all data under Your data. Lernzeit then asks again."
      action={
        hasData === false ? (
          <Button size="sm" icon={<Languages size={15} strokeWidth={1.8} />} onClick={() => setDialog('welcome')}>
            Choose a language
          </Button>
        ) : (
          <Button size="sm" icon={<Plus size={15} strokeWidth={1.8} />} disabled={!missing.length} onClick={() => setDialog('level')} title={missing.length ? `Adds ${missing.join(' or ')}` : 'You have every level of the pack'}>
            Add a level
          </Button>
        )
      }
    >
      {hasData === false ? (
        <p className="text-small text-muted">Nothing to learn yet. Choose a language to add its words, stories, questions and grammar.</p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body">
          <dt className="text-muted">Learning</dt>
          <dd className="font-medium">{language.name}</dd>
          <dt className="text-muted">Explained in</dt>
          <dd>{language.native.name}</dd>
          <dt className="text-muted">Levels</dt>
          <dd className="tabular-nums">{settings.levels.join(', ') || 'None'}</dd>
        </dl>
      )}
      <LanguageDialog open={dialog !== null} mode={dialog ?? 'level'} onClose={() => setDialog(null)} />
    </Group>
  )
}
