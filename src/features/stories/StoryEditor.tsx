import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import { useDecks, useTopics } from '@/data/hooks'
import { deleteStory, parseLevel, pickStoryTopic, saveStory, STORY_LEVELS } from '@/data/stories'
import type { Story } from '@/db/types'
import { countWords, splitParagraphs } from '@/lib/reader'
import { count } from '@/lib/text'

/** Adds a story, or edits `story`. */
export function StoryEditorDialog({
  open,
  story,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean
  story?: Story
  onClose: () => void
  onSaved?: (story: Story) => void
  onDeleted?: () => void
}) {
  return (
    <Dialog open={open} onClose={onClose} title={story ? 'Edit story' : 'New story'} size="lg">
      {open && <StoryForm key={story?.id ?? 'new'} story={story} onClose={onClose} onSaved={onSaved} onDeleted={onDeleted} />}
    </Dialog>
  )
}

function StoryForm({ story, onClose, onSaved, onDeleted }: { story?: Story; onClose: () => void; onSaved?: (story: Story) => void; onDeleted?: () => void }) {
  const decks = useDecks()
  const topics = useTopics()
  const { toast, confirm } = useFeedback()
  const [title, setTitle] = useState(story?.title ?? '')
  const [level, setLevel] = useState<string>(story?.level ?? '')
  // `undefined` until picked, so a new story follows the decks' topic once they load.
  const [topicId, setTopicId] = useState<string | undefined>(story ? (story.topicId ?? '') : undefined)
  const [text, setText] = useState(story?.text ?? '')
  const [translation, setTranslation] = useState(story?.translation ?? '')
  const [saving, setSaving] = useState(false)

  const topic = topicId ?? pickStoryTopic(decks, topics) ?? ''
  const paragraphs = splitParagraphs(text).length
  const translated = splitParagraphs(translation).length
  const ready = !!title.trim() && !!text.trim() && !saving

  const save = async () => {
    if (!ready) return
    setSaving(true)
    try {
      const saved = await saveStory({ title, text, translation, level: parseLevel(level), topicId: topic, tags: story?.tags ?? [] }, story?.id)
      toast(story ? 'Story saved' : 'Story added')
      onSaved?.(saved)
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save the story', { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!story) return
    const ok = await confirm({ title: 'Delete this story?', body: 'Its cards and the reading time in History stay.', confirmLabel: 'Delete', danger: true })
    if (!ok) return
    await deleteStory(story.id)
    toast('Story deleted')
    onClose()
    onDeleted?.()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      className="flex flex-col gap-5"
    >
      <Field label="Title" htmlFor="story-title">
        <Input id="story-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ein Tag in Berlin" autoComplete="off" lang="de" autoFocus={!story} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Level" htmlFor="story-level">
          <Select id="story-level" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">No level</option>
            {STORY_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reading time counts toward" htmlFor="story-topic">
          <Select id="story-topic" value={topic} onChange={(e) => setTopicId(e.target.value)}>
            <option value="">No topic</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        label="German text"
        htmlFor="story-text"
        hint={text.trim() ? `${count(paragraphs, 'paragraph')} · ${count(countWords(text), 'word')}. Leave an empty line between paragraphs.` : 'Leave an empty line between paragraphs.'}
      >
        <Textarea id="story-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} lang="de" placeholder="Anna wohnt in Berlin. Sie hat einen Hund." />
      </Field>
      <Field
        label="English translation (optional)"
        htmlFor="story-translation"
        hint={
          translation.trim() && translated !== paragraphs
            ? `It has ${count(translated, 'paragraph')} and the text has ${paragraphs}, so it shows after the story instead of under each paragraph.`
            : 'Give it the same paragraphs, and each one shows under its German paragraph.'
        }
      >
        <Textarea id="story-translation" rows={6} value={translation} onChange={(e) => setTranslation(e.target.value)} placeholder="Anna lives in Berlin. She has a dog." />
      </Field>

      <div className="sticky bottom-0 z-10 -mx-6 -mb-5 flex flex-wrap items-center gap-2 border-t border-line bg-soft px-6 py-3.5 pb-[max(14px,env(safe-area-inset-bottom))]">
        {story && (
          <Button variant="ghost" className="text-red-ink hover:text-red-ink" icon={<Trash2 size={15} strokeWidth={1.8} />} onClick={() => void remove()}>
            Delete
          </Button>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!ready}>
            {story ? 'Save changes' : 'Add story'}
          </Button>
        </div>
      </div>
    </form>
  )
}
