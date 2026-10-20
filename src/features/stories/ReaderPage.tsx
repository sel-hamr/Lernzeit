import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BookOpen, Check, ChevronLeft, Highlighter, Languages, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState, PageHeader, Section } from '@/components/ui/primitives'
import { PillToggle } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import { useLanguage, useLearningText, useSettings, useStory } from '@/data/hooks'
import { markStoryOpened, markStoryRead } from '@/data/stories'
import type { Story } from '@/db/types'
import { isTypingTarget, useMediaQuery, useStoredToggle } from '@/lib/browser'
import { readingMinutes, sentenceAt } from '@/lib/reader'
import { speak, stopSpeaking, voiceOptions, warmUpVoice } from '@/data/voice'
import { count } from '@/lib/text'
import { CoverageBar, CoverageLegend, DifficultyChip } from './Coverage'
import { percent } from './difficulty'
import { HighlightKey, StoryText, type WordRef } from './StoryText'
import { StoryEditorDialog } from './StoryEditor'
import { useReadingTime } from './useReadingTime'
import { annotateStory, useVocabulary } from './vocabulary'
import { WordPanel } from './WordPanel'

function Reader({ story }: { story: Story }) {
  const language = useLanguage()
  const learning = useLearningText()
  const vocabulary = useVocabulary()
  const settings = useSettings()
  const navigate = useNavigate()
  const { toast } = useFeedback()
  const wide = useMediaQuery('(min-width: 1100px)')
  const [selected, setSelected] = useState<WordRef | null>(null)
  const [highlights, setHighlights] = useStoredToggle('lernzeit-reader-highlights', true)
  const [showTranslation, setShowTranslation] = useStoredToggle('lernzeit-reader-translation', false)
  const [editing, setEditing] = useState(false)

  const annotated = useMemo(() => annotateStory(story, vocabulary), [story, vocabulary])
  const { coverage } = annotated
  // After an edit the selected word may no longer be there; then nothing is selected.
  const paragraph = selected ? annotated.paragraphs[selected.paragraph] : undefined
  const piece = paragraph?.pieces.find((p) => p.words && p.start === selected?.start)

  useEffect(() => {
    void markStoryOpened(story.id)
  }, [story.id])

  // Speech started here stops when you leave the story.
  useEffect(() => stopSpeaking, [])

  useReadingTime({ storyId: story.id, title: story.title, topicId: story.topicId, enabled: settings.countReadingTime })

  useEffect(() => {
    if (!piece) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isTypingTarget(e.target)) setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [piece])

  const say = (text: string) => speak(text, voiceOptions(settings))
  // Loads the offline voice now, so the first word you tap plays without waiting.
  useEffect(() => warmUpVoice({ engine: settings.voiceEngine }), [settings.voiceEngine])

  const finish = async () => {
    await markStoryRead(story.id)
    toast('Marked as read', { action: { label: 'All stories', onClick: () => navigate('/stories') } })
  }

  const subtitle = [
    story.level,
    count(coverage.words, 'word'),
    `${readingMinutes(coverage.words)} min read`,
    story.readCount > 0 && `read ${story.readCount === 1 ? 'once' : `${story.readCount} times`}`,
  ]
    .filter(Boolean)
    .join(' · ')

  const panel = piece && paragraph && (
    <WordPanel
      key={`${selected?.paragraph}:${piece.start}`}
      word={piece.text}
      sentence={sentenceAt(paragraph.text, piece.start)}
      cardIds={piece.cardIds}
      vocabulary={vocabulary}
    />
  )

  return (
    <>
      <div className="flex flex-col gap-3">
        <Link to="/stories" className="inline-flex items-center gap-1 self-start rounded-img text-small text-muted transition-colors hover:text-ink">
          <ChevronLeft size={16} strokeWidth={1.8} aria-hidden />
          Stories
        </Link>
        <PageHeader
          title={<span {...learning}>{story.title}</span>}
          subtitle={subtitle}
          actions={
            <Button variant="outline" icon={<Pencil size={15} strokeWidth={1.8} />} onClick={() => setEditing(true)}>
              Edit
            </Button>
          }
        />
      </div>

      <Section className="flex flex-col gap-3.5 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
            {vocabulary.loaded && <DifficultyChip coverage={coverage} />}
            <span className="text-small text-muted tabular-nums">
              {vocabulary.loaded
                ? `${percent(coverage.known + coverage.learning, coverage.words)}% known or learning · ${percent(coverage.words - coverage.unknown, coverage.words)}% in your decks`
                : null}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <PillToggle pressed={highlights} onChange={setHighlights} icon={<Highlighter size={15} strokeWidth={1.8} aria-hidden />}>
              Highlights
            </PillToggle>
            {story.translation && (
              <PillToggle pressed={showTranslation} onChange={setShowTranslation} icon={<Languages size={15} strokeWidth={1.8} aria-hidden />}>
                Translation
              </PillToggle>
            )}
          </div>
        </div>
        {vocabulary.loaded && (
          <>
            <CoverageBar coverage={coverage} />
            <CoverageLegend coverage={coverage} />
          </>
        )}
        {!wide && (
          <details>
            <summary className="cursor-pointer text-chip text-sage-ink hover:text-ink">What the colours mean</summary>
            <div className="pt-3">
              <HighlightKey />
            </div>
          </details>
        )}
      </Section>

      <div className="flex flex-wrap items-start gap-6">
        <Section className="flex min-w-0 flex-[999_1_520px] flex-col gap-8 px-5 py-6 sm:px-8 sm:py-8">
          <StoryText
            story={annotated}
            vocabulary={vocabulary}
            highlights={highlights && vocabulary.loaded}
            showTranslation={showTranslation}
            selected={piece ? selected : null}
            onSelect={setSelected}
            onSpeak={say}
          />
          {showTranslation && story.translation && !annotated.translation && (
            <div className="flex flex-col gap-2 border-t border-line pt-6">
              <h2 className="text-small font-medium text-muted">Translation</h2>
              <p className="text-body whitespace-pre-line text-muted">{story.translation}</p>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <span className="text-small text-muted">{story.readCount ? 'Read it again?' : 'Done reading?'}</span>
            <Button variant="primary" icon={<Check size={16} strokeWidth={1.9} />} onClick={() => void finish()}>
              Mark as read
            </Button>
          </div>
        </Section>

        {wide && (
          <aside
            aria-label="Word"
            className="sticky top-8 flex max-h-[calc(100dvh-4rem)] min-w-0 flex-[1_1_300px] flex-col overflow-y-auto rounded-section border border-line bg-main p-2.5 pb-4 shadow-panel"
          >
            {panel || (
              <div className="flex flex-col gap-4 p-3.5">
                <div className="flex flex-col gap-1">
                  <h2 className="text-section font-semibold">Tap a word</h2>
                  <p className="text-small text-muted">See its card with the picture and the {language.native.name}, or add it to a deck.</p>
                </div>
                <HighlightKey />
              </div>
            )}
          </aside>
        )}
      </div>

      {!wide && (
        <Dialog open={!!panel} onClose={() => setSelected(null)} title="Word">
          {panel}
        </Dialog>
      )}
      <StoryEditorDialog open={editing} story={story} onClose={() => setEditing(false)} onDeleted={() => navigate('/stories', { replace: true })} />
    </>
  )
}

export default function ReaderPage() {
  const { storyId } = useParams()
  const story = useStory(storyId)
  if (story === undefined) return <div className="h-40" aria-busy="true" />
  if (story === null) {
    return (
      <div className="rounded-section border border-line">
        <EmptyState
          icon={<BookOpen size={20} strokeWidth={1.6} />}
          title="This story is not here"
          action={
            <Link to="/stories" className="text-small font-medium text-sage-ink hover:text-ink">
              All stories
            </Link>
          }
        >
          It may have been deleted.
        </EmptyState>
      </div>
    )
  }
  return <Reader key={story.id} story={story} />
}
