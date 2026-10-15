import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { BookOpen, Plus, Sparkles, WandSparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Chip, EmptyState, PageHeader } from '@/components/ui/primitives'
import { useFeedback } from '@/components/ui/feedback'
import { useStories } from '@/data/hooks'
import { installStarterStories } from '@/data/stories'
import type { Story } from '@/db/types'
import { countWords, readingMinutes, splitParagraphs } from '@/lib/reader'
import { count } from '@/lib/text'
import { CoverageBar, DifficultyChip } from './Coverage'
import { percent } from './difficulty'
import { AiStoryDialog } from './AiStoryDialog'
import { StoryEditorDialog } from './StoryEditor'
import { annotateStory, useVocabulary, type Vocabulary } from './vocabulary'

function StoryTile({ story, vocabulary }: { story: Story; vocabulary: Vocabulary }) {
  const { coverage } = useMemo(() => annotateStory(story, vocabulary), [story, vocabulary])
  const preview = splitParagraphs(story.text)[0] ?? ''
  return (
    <Link
      to={`/stories/${story.id}`}
      className="group flex flex-col gap-3 rounded-section border border-line bg-main p-5 transition-[border-color,background-color] hover:border-line-strong hover:bg-soft"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {story.level && <Chip tone="sage">{story.level}</Chip>}
        {vocabulary.loaded && <DifficultyChip coverage={coverage} />}
        {story.readCount > 0 && <span className="ml-auto text-chip text-muted">Read {story.readCount === 1 ? 'once' : `${story.readCount} times`}</span>}
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 lang="de" className="text-section font-semibold group-hover:underline">
          {story.title}
        </h2>
        <p lang="de" className="line-clamp-2 text-small text-muted">
          {preview}
        </p>
      </div>
      <div className="mt-auto flex flex-col gap-2 pt-1">
        {vocabulary.loaded && <CoverageBar coverage={coverage} className="h-1.5" />}
        <div className="flex justify-between gap-3 text-chip text-muted tabular-nums">
          <span>{vocabulary.loaded ? `${percent(coverage.words - coverage.unknown, coverage.words)}% in your decks` : null}</span>
          <span>
            {count(coverage.words, 'word')} · {readingMinutes(countWords(story.text))} min
          </span>
        </div>
      </div>
    </Link>
  )
}

export default function StoriesPage() {
  const stories = useStories()
  const vocabulary = useVocabulary()
  const navigate = useNavigate()
  const { toast } = useFeedback()
  const [editorOpen, setEditorOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [installing, setInstalling] = useState(false)

  const addStarter = async () => {
    setInstalling(true)
    try {
      const added = await installStarterStories()
      toast(added ? `Added ${count(added, 'starter story', 'starter stories')}` : 'All starter stories are already here')
    } finally {
      setInstalling(false)
    }
  }

  const total = stories?.length ?? 0

  return (
    <>
      <PageHeader
        title="Stories"
        subtitle={`${count(total, 'story', 'stories')} · tap any word while you read`}
        actions={
          <>
            {total > 0 && (
              <Button
                variant="ghost"
                disabled={installing}
                icon={<Sparkles size={15} strokeWidth={1.8} />}
                onClick={() => void addStarter()}
                title="Adds the starter stories you do not have yet"
              >
                Starter stories
              </Button>
            )}
            <Button variant="outline" icon={<WandSparkles size={15} strokeWidth={1.8} />} onClick={() => setAiOpen(true)}>
              Write with AI
            </Button>
            <Button variant="soft" icon={<Plus size={16} strokeWidth={1.8} />} onClick={() => setEditorOpen(true)}>
              New story
            </Button>
          </>
        }
      />

      {stories && !stories.length ? (
        <div className="rounded-section border border-line">
          <EmptyState
            icon={<BookOpen size={20} strokeWidth={1.6} />}
            title="No stories yet"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" disabled={installing} icon={<Sparkles size={15} strokeWidth={1.8} />} onClick={() => void addStarter()}>
                  Add starter stories
                </Button>
                <Button variant="outline" icon={<WandSparkles size={15} strokeWidth={1.8} />} onClick={() => setAiOpen(true)}>
                  Write with AI
                </Button>
                <Button variant="soft" icon={<Plus size={16} strokeWidth={1.8} />} onClick={() => setEditorOpen(true)}>
                  Write a story
                </Button>
              </div>
            }
          >
            Read short German stories with your decks. Words you are learning light up, and any word can become a card. Claude can write stories with your deck's words.
          </EmptyState>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {stories?.map((story) => <StoryTile key={story.id} story={story} vocabulary={vocabulary} />)}
        </div>
      )}

      <AiStoryDialog open={aiOpen} onClose={() => setAiOpen(false)} />
      <StoryEditorDialog open={editorOpen} onClose={() => setEditorOpen(false)} onSaved={(story) => navigate(`/stories/${story.id}`)} />
    </>
  )
}
