import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import { installLevels } from '@/data/languages'
import type { StoryLevel } from '@/db/types'
import { levelSummary, loadPack, PACK, type LevelSummary, type PackContent } from '@/languages'
import { count } from '@/lib/text'

/** Picks one of these levels of the German pack to install. */
export function LevelDialog({ open, onClose, levels }: { open: boolean; onClose: () => void; levels: StoryLevel[] }) {
  // Mounted only while open, so every opening starts from a fresh choice.
  return open ? <OpenLevelDialog levels={levels} onClose={onClose} /> : null
}

/** The pack's content, loaded when the dialog opens. */
function usePackContent(): PackContent | undefined {
  const [content, setContent] = useState<PackContent>()
  useEffect(() => {
    let live = true
    loadPack()
      .then((loaded) => {
        if (live) setContent(loaded)
      })
      .catch((err) => console.error('Loading the pack failed', err))
    return () => {
      live = false
    }
  }, [])
  return content
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

function OpenLevelDialog({ levels, onClose }: { levels: StoryLevel[]; onClose: () => void }) {
  const { toast } = useFeedback()
  const [levelPick, setLevelPick] = useState<StoryLevel>()
  const [installing, setInstalling] = useState(false)

  const level = levelPick && levels.includes(levelPick) ? levelPick : levels[0]
  const content = usePackContent()
  const summary = content && level ? levelSummary(content, level) : undefined

  const start = async () => {
    if (!level) return
    setInstalling(true)
    try {
      const added = await installLevels([level])
      const parts = [count(added.cards, 'card'), count(added.stories, 'story', 'stories'), count(added.questions, 'question'), count(added.topics, 'grammar topic')]
      toast(`${PACK.name} ${level}: added ${parts.join(', ')}`)
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not add the level', { tone: 'error' })
    } finally {
      setInstalling(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      locked={installing}
      title="Add a level"
      description="Adds ready-made German words, stories, questions and grammar for a level."
      footer={
        <>
          <Button variant="ghost" disabled={installing} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!level || installing} onClick={() => void start()}>
            {installing ? 'Adding…' : `Add ${level ?? 'level'}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 pt-1">
        {level ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-ink-2">My level</span>
            <Segmented label="Level" options={levels.map((l) => ({ value: l, label: l }))} value={level} onChange={setLevelPick} className="self-start" />
            <span className="text-chip text-muted" aria-live="polite">
              {summary ? describe(summary) : 'Loading…'}
            </span>
          </div>
        ) : (
          <p className="text-small text-muted">You have every level of the {PACK.name} pack.</p>
        )}
      </div>
    </Dialog>
  )
}
