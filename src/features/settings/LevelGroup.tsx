import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useHasLearningData, useSettings } from '@/data/hooks'
import { PACK } from '@/languages'
import { Group } from './Group'
import { LevelDialog } from './LevelDialog'

/** Optional ready-made content: the levels you added, and adding another. */
export function LevelGroup() {
  const settings = useSettings()
  const hasData = useHasLearningData()
  const [open, setOpen] = useState(false)
  // With nothing left to learn, any level can be added again.
  const available = PACK.levels.filter((l) => hasData === false || !settings.levels.includes(l))

  return (
    <Group
      title="Starter content"
      description="Optional: ready-made German words, stories, questions and grammar."
      action={
        <Button size="sm" icon={<Plus size={15} strokeWidth={1.8} />} disabled={!available.length} onClick={() => setOpen(true)} title={available.length ? `Adds ${available.join(' or ')}` : 'You have every level of the pack'}>
          Add a level
        </Button>
      }
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body">
        <dt className="text-muted">Levels</dt>
        <dd className="tabular-nums">{settings.levels.join(', ') || 'None'}</dd>
      </dl>
      <LevelDialog open={open} levels={available} onClose={() => setOpen(false)} />
    </Group>
  )
}
