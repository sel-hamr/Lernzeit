import { MAX_STORY_CHARS, MAX_STORY_SENTENCE, MAX_STORY_TITLE, MAX_STORY_WORD_TEXT, MAX_STORY_WORDS, type CreateStoryParams, type CreateStoryResult, type StorySummary } from '../protocol'
import { countWords, splitParagraphs } from '../reader'
import { normalizeStory, parseLevel, pickStoryTopic } from '../stories'
import { placementProblem } from '../storyWords'
import type { Gender, Story, StoryWord, Topic } from '../types'
import { AI_TAG, byId, byOrder, findTopic, invalid, sortedDecks, type ActionContext } from './shared'

async function describeStory(ctx: ActionContext, story: Story): Promise<StorySummary> {
  const topic = story.topicId ? await ctx.store.get<Topic>('topics', story.topicId) : undefined
  return {
    id: story.id,
    title: story.title,
    level: story.level,
    words: countWords(story.text),
    paragraphs: splitParagraphs(story.text).length,
    topic: topic?.name,
  }
}

async function defaultStoryTopicId(ctx: ActionContext): Promise<string | undefined> {
  const [decks, topics] = await Promise.all([sortedDecks(ctx), ctx.store.list<Topic>('topics')])
  return pickStoryTopic(decks, topics.sort(byOrder))
}

const GENDERS: readonly Gender[] = ['der', 'die', 'das']

/** A teaching note made tidy, or why it cannot be used. An AI app could send anything; the type only covers well-formed calls. */
function cleanStoryWord(note: StoryWord, paragraphs: string[]): StoryWord | string {
  const text = (value: unknown, name: string): string => {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is missing.`)
    if (value.length > MAX_STORY_WORD_TEXT) throw new Error(`Keep ${name} under ${MAX_STORY_WORD_TEXT} characters.`)
    return value.trim()
  }
  const optional = (value: unknown, name: string) => (value === undefined || value === null || value === '' ? undefined : text(value, name))
  try {
    if (typeof note.sentence !== 'string' || note.sentence.length > MAX_STORY_SENTENCE) {
      throw new Error(`sentence must be one sentence of the story, under ${MAX_STORY_SENTENCE} characters.`)
    }
    if (note.gender !== undefined && !GENDERS.includes(note.gender)) throw new Error('gender must be der, die or das.')
    if (note.alsoTap !== undefined && !Array.isArray(note.alsoTap)) throw new Error('alsoTap must be a list of words.')
    const { grammar } = note
    const clean: StoryWord = {
      word: text(note.word, 'word'),
      sentence: note.sentence.trim(),
      alsoTap: note.alsoTap?.length ? note.alsoTap.map((word) => text(word, 'alsoTap')) : undefined,
      baseForm: text(note.baseForm, 'baseForm'),
      gender: note.gender,
      partOfSpeech: text(note.partOfSpeech, 'partOfSpeech'),
      translation: text(note.translation, 'translation'),
      meaning: optional(note.meaning, 'meaning'),
      grammar: grammar && {
        rule: text(grammar.rule, 'grammar.rule'),
        why: text(grammar.why, 'grammar.why'),
        example: {
          text: text(grammar.example?.text, 'grammar.example.text'),
          translation: text(grammar.example?.translation, 'grammar.example.translation'),
        },
      },
      tip: optional(note.tip, 'tip'),
    }
    return placementProblem(paragraphs, clean) ?? clean
  } catch (e) {
    return (e as Error).message
  }
}

/** Sorts a call's teaching notes into the ones to save and the ones to report back. */
function sortStoryWords(words: StoryWord[], text: string) {
  const paragraphs = splitParagraphs(text)
  const saved: StoryWord[] = []
  const skipped: NonNullable<CreateStoryResult['words']>['skipped'] = []
  for (const note of words) {
    const clean = cleanStoryWord(note, paragraphs)
    if (typeof clean === 'string') skipped.push({ word: String(note.word ?? ''), sentence: String(note.sentence ?? ''), reason: clean })
    else saved.push(clean)
  }
  return { saved, skipped }
}

export async function createStory({ title, text, translation, level, tags, topic, words }: CreateStoryParams, ctx: ActionContext): Promise<CreateStoryResult> {
  if (!title.trim()) throw invalid('A story needs a title.')
  if (title.length > MAX_STORY_TITLE) throw invalid(`Keep the title under ${MAX_STORY_TITLE} characters.`)
  if (!text.trim()) throw invalid('A story needs text.')
  if (text.length > MAX_STORY_CHARS || (translation?.length ?? 0) > MAX_STORY_CHARS) {
    throw invalid(`Keep the text and the translation under ${MAX_STORY_CHARS} characters each.`)
  }
  if (level !== undefined && !parseLevel(level)) throw invalid('level must be one of A1, A2, B1, B2, C1 or C2.')
  if (words !== undefined && !Array.isArray(words)) throw invalid('words must be a list of notes.')
  if ((words?.length ?? 0) > MAX_STORY_WORDS) throw invalid(`Send at most ${MAX_STORY_WORDS} words. Keep the ones that help most.`)

  const notes = words && sortStoryWords(words, text)
  const report = notes && { words: { saved: notes.saved.length, skipped: notes.skipped } }
  const linked = topic ? await findTopic(ctx, topic) : undefined
  const existing = (await ctx.store.list<Story>('stories')).sort(byId).find((s) => s.text === text.trim())
  if (existing) {
    // This is how a story gets better notes, so a call whose notes all failed leaves the old ones alone.
    if (notes?.saved.length) ctx.store.put('stories', { ...existing, words: notes.saved, updatedAt: ctx.now })
    return { story: await describeStory(ctx, existing), created: false, ...report }
  }
  // As the story editor saves a new story.
  const story: Story = {
    ...normalizeStory({
      title,
      text,
      translation,
      level,
      topicId: linked?.id ?? (await defaultStoryTopicId(ctx)),
      tags: [...(tags ?? []), AI_TAG],
      words: notes?.saved,
    }),
    id: ctx.newId(),
    createdAt: ctx.now,
    updatedAt: ctx.now,
    readCount: 0,
  }
  ctx.store.put('stories', story)
  return { story: await describeStory(ctx, story), created: true, ...report }
}
