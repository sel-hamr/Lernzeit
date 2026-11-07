import { db, newId, type LernzeitDB } from '@/db/db'
import type { Card, Deck, Gender, GrammarTopic, Story, StoryWord, Topic } from '@/db/types'
import { createDeck, deleteCard, deleteDeck, moveCard } from '@/data/cards'
import { writeCardPack, type CardPack, type CardPackCard } from '@/data/io'
import { DEFAULT_GROUP, saveTopic } from '@/data/grammar'
import { saveQuestion } from '@/data/questions'
import { defaultStoryTopicId, parseLevel, saveStory } from '@/data/stories'
import { createTask } from '@/data/tasks'
import { logManualSession } from '@/data/topics'
import { splitArticle } from '@/lib/german'
import { exerciseProblem } from '@/lib/grammar'
import { countWords, splitParagraphs } from '@/lib/reader'
import { placementProblem } from '@/lib/storyWords'
import { dateKey, MINUTE } from '@/lib/time'
import {
  BridgeError,
  MAX_CARDS_PER_CALL,
  MAX_CARDS_PER_LIST,
  MAX_GRAMMAR_EXAMPLES_PER_CALL,
  MAX_GRAMMAR_EXERCISES_PER_CALL,
  MAX_GRAMMAR_TEXT,
  MAX_HINT_WORDS,
  MAX_QUESTION_CHARS,
  MAX_QUESTIONS_PER_CALL,
  MAX_RULE_CHARS,
  MAX_SET_NAME,
  MAX_STORY_CHARS,
  MAX_STORY_SENTENCE,
  MAX_STORY_TITLE,
  MAX_STORY_WORD_TEXT,
  MAX_STORY_WORDS,
  MAX_STUDY_MINUTES,
  toErrorBody,
  type ActionName,
  type ActionParams,
  type ActionResult,
  type CreateCardsParams,
  type CreateCardsResult,
  type CreateDeckParams,
  type CreateDeckResult,
  type AddGrammarParams,
  type AddGrammarResult,
  type CardDetails,
  type CreateQuestionsParams,
  type CreateQuestionsResult,
  type GrammarTopicSummary,
  type CreateStoryParams,
  type CreateStoryResult,
  type CreateTaskParams,
  type DeckSummary,
  type DeleteCardsParams,
  type DeleteCardsResult,
  type DeleteDeckParams,
  type DeleteDeckResult,
  type ListCardsParams,
  type ListCardsResult,
  type LogStudyTimeParams,
  type MoveCardsParams,
  type MoveCardsResult,
  type NewCard,
  type RequestMessage,
  type ResponseMessage,
  type SessionSummary,
  type StorySummary,
  type TaskSummary,
  type TopicSummary,
} from './protocol'

/** Every card, story and question added through the bridge gets this tag, so it is easy to find and check. */
export const AI_TAG = 'ai'

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

const key = (text: string) => text.trim().toLowerCase()
const nameList = (items: { name: string }[]) => items.map((i) => i.name).join(', ') || 'none'
const invalid = (message: string) => new BridgeError('invalid_input', message)

/** "2026-10-15T08:30" in local time, the way people say it. */
function localDateTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function activeTopics(database: LernzeitDB): Promise<Topic[]> {
  return (await database.topics.orderBy('order').toArray()).filter((t) => !t.archived)
}

async function findTopic(database: LernzeitDB, nameOrId: string): Promise<Topic> {
  const topics = await activeTopics(database)
  const topic = topics.find((t) => t.id === nameOrId) ?? topics.find((t) => key(t.name) === key(nameOrId))
  if (!topic) throw new BridgeError('topic_not_found', `No topic named "${nameOrId}". Topics: ${nameList(topics)}.`)
  return topic
}

async function findDeck(database: LernzeitDB, nameOrId: string): Promise<Deck> {
  const decks = await database.decks.orderBy('order').toArray()
  const deck = decks.find((d) => d.id === nameOrId) ?? decks.find((d) => key(d.name) === key(nameOrId))
  if (!deck) throw new BridgeError('deck_not_found', `No deck named "${nameOrId}". Decks: ${nameList(decks)}.`)
  return deck
}

async function describeDeck(database: LernzeitDB, deck: Deck): Promise<DeckSummary> {
  const [topic, cards] = await Promise.all([
    deck.topicId ? database.topics.get(deck.topicId) : undefined,
    database.cards.where('deckId').equals(deck.id).count(),
  ])
  return { id: deck.id, name: deck.name, topic: topic?.name, cards }
}

async function describeStory(database: LernzeitDB, story: Story): Promise<StorySummary> {
  const topic = story.topicId ? await database.topics.get(story.topicId) : undefined
  return {
    id: story.id,
    title: story.title,
    level: story.level,
    words: countWords(story.text),
    paragraphs: splitParagraphs(story.text).length,
    topic: topic?.name,
  }
}

/** Fills in the card type and moves a leading article into `gender`, as the CSV import does. */
function normalizeCard(card: NewCard): NewCard {
  const german = card.german.trim()
  const type = card.type ?? (german.includes('{{') ? 'cloze' : 'word')
  if (type !== 'word') return { ...card, german, type, gender: undefined }
  const split = splitArticle(german)
  return { ...card, german: split.word, type, gender: card.gender ?? split.gender }
}

/* ------------------------------------------------------------ Handlers ---- */

async function listTopics(_params: unknown, database: LernzeitDB): Promise<TopicSummary[]> {
  return (await activeTopics(database)).map(({ id, name }) => ({ id, name }))
}

async function listDecks(_params: unknown, database: LernzeitDB): Promise<DeckSummary[]> {
  const [decks, topics, cardDeckIds] = await Promise.all([
    database.decks.orderBy('order').toArray(),
    database.topics.toArray(),
    database.cards.orderBy('deckId').keys(),
  ])
  const topicName = new Map(topics.map((t) => [t.id, t.name]))
  const counts = new Map<string, number>()
  for (const id of cardDeckIds) counts.set(String(id), (counts.get(String(id)) ?? 0) + 1)
  return decks.map((d) => ({ id: d.id, name: d.name, topic: d.topicId ? topicName.get(d.topicId) : undefined, cards: counts.get(d.id) ?? 0 }))
}

async function createDeckAction({ name, topic }: CreateDeckParams, database: LernzeitDB): Promise<CreateDeckResult> {
  const trimmed = name.trim()
  if (!trimmed) throw invalid('A deck needs a name.')
  const linked = topic ? await findTopic(database, topic) : undefined
  const existing = (await database.decks.toArray()).find((d) => key(d.name) === key(trimmed))
  if (existing) return { deck: await describeDeck(database, existing), created: false }
  const deck = await createDeck({ name: trimmed, topicId: linked?.id }, database)
  return { deck: { id: deck.id, name: deck.name, topic: linked?.name, cards: 0 }, created: true }
}

async function createCards({ deck: deckRef, cards }: CreateCardsParams, database: LernzeitDB): Promise<CreateCardsResult> {
  if (!cards.length) throw invalid('Send at least one card.')
  if (cards.length > MAX_CARDS_PER_CALL) throw invalid(`Send at most ${MAX_CARDS_PER_CALL} cards per call.`)
  cards.forEach((card, i) => {
    if (!card.english.trim() || !card.german.trim()) throw invalid(`Card ${i + 1} needs both english (the meaning) and german (the word in the language you learn).`)
  })

  const tables = [database.topics, database.decks, database.cards, database.reviews, database.images]
  return database.transaction('rw', tables, async () => {
    const deck = await findDeck(database, deckRef)
    const seen = new Set((await database.cards.where('deckId').equals(deck.id).toArray()).map((c) => key(c.german)))
    const fresh: CardPackCard[] = []
    const skipped: string[] = []

    for (const card of cards.map(normalizeCard)) {
      if (seen.has(key(card.german))) {
        skipped.push(card.german)
        continue
      }
      seen.add(key(card.german))
      fresh.push({ ...card, deckId: deck.id, tags: [...new Set([...(card.tags ?? []), AI_TAG])] })
    }

    const pack: CardPack = { format: 'lernzeit-cards', version: 1, decks: [{ id: deck.id, name: deck.name }], cards: fresh }
    const { cards: added } = await writeCardPack({ pack, images: new Map() }, {}, database)
    return { deck: deck.name, added, skipped }
  })
}

/** What the card shows: "der Hund" for a noun, the German text otherwise. */
const shownText = (card: Card) => (card.gender ? `${card.gender} ${card.german}` : card.german)

function describeCard(card: Card, deck: string): CardDetails {
  const { id, type, german, english, gender, plural, verbForms, conjugation, partOfSpeech, exampleDe, exampleEn, tags, emoji, imageQuery } = card
  return { id, deck, type, german, english, gender, plural, verbForms, conjugation, partOfSpeech, exampleDe, exampleEn, tags, emoji, imageQuery, hasImage: !!card.imageId }
}

async function listCards({ deck: deckRef, search, tag, limit = MAX_CARDS_PER_LIST, offset = 0 }: ListCardsParams, database: LernzeitDB): Promise<ListCardsResult> {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CARDS_PER_LIST) throw invalid(`limit must be a whole number from 1 to ${MAX_CARDS_PER_LIST}.`)
  if (!Number.isInteger(offset) || offset < 0) throw invalid('offset must be a whole number, 0 or more.')

  return database.transaction('r', [database.decks, database.cards], async () => {
    const decks = deckRef ? [await findDeck(database, deckRef)] : await database.decks.orderBy('order').toArray()
    const place = new Map(decks.map((d, i) => [d.id, i]))
    const query = key(search ?? '')
    const wanted = key(tag ?? '')
    const cards = (await database.cards.where('deckId').anyOf([...place.keys()]).toArray())
      .filter((c) => !wanted || c.tags.some((t) => key(t) === wanted))
      .filter((c) => !query || key(shownText(c)).includes(query) || key(c.english).includes(query))
      .sort((a, b) => place.get(a.deckId)! - place.get(b.deckId)! || a.createdAt - b.createdAt)
    const names = new Map(decks.map((d) => [d.id, d.name]))
    return { total: cards.length, offset, cards: cards.slice(offset, offset + limit).map((c) => describeCard(c, names.get(c.deckId)!)) }
  })
}

function checkCardRefs(refs: string[]) {
  if (!refs.length) throw invalid('Send at least one card: its id from list_cards or its German text.')
  if (refs.length > MAX_CARDS_PER_CALL) throw invalid(`Send at most ${MAX_CARDS_PER_CALL} cards per call.`)
  if (refs.some((ref) => !ref.trim())) throw invalid('Each card needs its id from list_cards or its German text.')
}

/**
 * The cards a ref names: a card id, or the German text in any case. When no
 * card has that text, "der Hund" also finds the word card "Hund".
 */
function cardsNamed(cards: Card[], ref: string): Card[] {
  const byId = cards.filter((c) => c.id === ref.trim())
  if (byId.length) return byId
  const exact = cards.filter((c) => key(c.german) === key(ref))
  if (exact.length) return exact
  const word = key(splitArticle(ref).word)
  return cards.filter((c) => c.type === 'word' && key(c.german) === word)
}

/** Looks up every ref in a deck's cards; a card named twice comes back once. */
function resolveCards(cards: Card[], refs: string[]): { found: Card[]; notFound: string[] } {
  const found = new Map<string, Card>()
  const notFound: string[] = []
  for (const ref of refs) {
    const matches = cardsNamed(cards, ref)
    if (!matches.length) notFound.push(ref.trim())
    for (const card of matches) found.set(card.id, card)
  }
  return { found: [...found.values()], notFound }
}

/** Moves cards with their progress; a card whose text the target deck already has stays put. */
async function moveCards({ deck: fromRef, to: toRef, cards: refs }: MoveCardsParams, database: LernzeitDB): Promise<MoveCardsResult> {
  checkCardRefs(refs)
  return database.transaction('rw', [database.decks, database.cards, database.reviews], async () => {
    const from = await findDeck(database, fromRef)
    const to = await findDeck(database, toRef)
    if (from.id === to.id) throw invalid(`The cards are in "${from.name}" already. Name another deck in to.`)
    const { found, notFound } = resolveCards(await database.cards.where('deckId').equals(from.id).toArray(), refs)
    const taken = new Set((await database.cards.where('deckId').equals(to.id).toArray()).map((c) => key(c.german)))
    const moved: string[] = []
    const skipped: string[] = []
    for (const card of found) {
      if (taken.has(key(card.german))) {
        skipped.push(card.german)
        continue
      }
      taken.add(key(card.german))
      await moveCard(card.id, to.id, database)
      moved.push(card.german)
    }
    return { from: from.name, to: to.name, moved, skipped, notFound }
  })
}

/** Deletes cards with their progress, the way the card editor does. */
async function deleteCards({ deck: deckRef, cards: refs }: DeleteCardsParams, database: LernzeitDB): Promise<DeleteCardsResult> {
  checkCardRefs(refs)
  const tables = [database.decks, database.cards, database.reviews, database.reviewLogs, database.drillStats, database.images]
  return database.transaction('rw', tables, async () => {
    const deck = await findDeck(database, deckRef)
    const { found, notFound } = resolveCards(await database.cards.where('deckId').equals(deck.id).toArray(), refs)
    for (const card of found) await deleteCard(card.id, database)
    return { deck: deck.name, deleted: found.map((c) => c.german), notFound }
  })
}

/** Deletes a deck with its cards and their progress, the way the deck dialog does. */
async function deleteDeckAction({ deck: deckRef, cardCount }: DeleteDeckParams, database: LernzeitDB): Promise<DeleteDeckResult> {
  if (!Number.isInteger(cardCount) || cardCount < 0) throw invalid('cardCount must be the number of cards in the deck, from list_decks.')
  const tables = [database.decks, database.cards, database.reviews, database.reviewLogs, database.drillStats, database.images]
  return database.transaction('rw', tables, async () => {
    const deck = await findDeck(database, deckRef)
    const cards = await database.cards.where('deckId').equals(deck.id).count()
    if (cards !== cardCount) throw invalid(`"${deck.name}" has ${cards} ${cards === 1 ? 'card' : 'cards'}, not ${cardCount}. Nothing was deleted; tell the user the real number and ask again.`)
    await deleteDeck(deck.id, database)
    return { deck: deck.name, deletedCards: cards }
  })
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

async function createStory({ title, text, translation, level, tags, topic, words }: CreateStoryParams, database: LernzeitDB): Promise<CreateStoryResult> {
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
  return database.transaction('rw', [database.stories, database.topics, database.decks], async () => {
    const linked = topic ? await findTopic(database, topic) : undefined
    const existing = (await database.stories.toArray()).find((s) => s.text === text.trim())
    if (existing) {
      // This is how a story gets better notes, so a call whose notes all failed leaves the old ones alone.
      if (notes?.saved.length) await database.stories.update(existing.id, { words: notes.saved, updatedAt: Date.now() })
      return { story: await describeStory(database, existing), created: false, ...report }
    }
    const story = await saveStory(
      {
        title,
        text,
        translation,
        level,
        topicId: linked?.id ?? (await defaultStoryTopicId(database)),
        tags: [...(tags ?? []), AI_TAG],
        words: notes?.saved,
      },
      undefined,
      database,
    )
    return { story: await describeStory(database, story), created: true, ...report }
  })
}

async function createQuestions({ set, questions }: CreateQuestionsParams, database: LernzeitDB): Promise<CreateQuestionsResult> {
  const name = set.trim().replace(/\s+/g, ' ')
  if (!name) throw invalid('A set needs a name.')
  if (name.length > MAX_SET_NAME) throw invalid(`Keep the set name under ${MAX_SET_NAME} characters.`)
  if (!questions.length) throw invalid('Send at least one question.')
  if (questions.length > MAX_QUESTIONS_PER_CALL) throw invalid(`Send at most ${MAX_QUESTIONS_PER_CALL} questions per call.`)
  questions.forEach((q, i) => {
    if (!q.question.trim()) throw invalid(`Question ${i + 1} needs text.`)
    if ([q.question, q.english, q.suggested].some((text) => (text?.length ?? 0) > MAX_QUESTION_CHARS)) {
      throw invalid(`Keep question ${i + 1} and its answers under ${MAX_QUESTION_CHARS} characters each.`)
    }
    if (q.level !== undefined && !parseLevel(q.level)) throw invalid(`Question ${i + 1}: level must be one of A1, A2, B1, B2, C1 or C2.`)
    if ((q.words?.length ?? 0) > MAX_HINT_WORDS) throw invalid(`Give question ${i + 1} at most ${MAX_HINT_WORDS} words.`)
  })

  return database.transaction('rw', database.questions, async () => {
    // Sets are matched without case, so "arbeit" adds to "Arbeit".
    const existing = (await database.questions.toArray()).filter((q) => key(q.set) === key(name))
    const setName = existing[0]?.set ?? name
    const seen = new Set(existing.map((q) => key(q.question)))
    const skipped: string[] = []
    let added = 0
    for (const q of questions) {
      if (seen.has(key(q.question))) {
        skipped.push(q.question.trim())
        continue
      }
      seen.add(key(q.question))
      // The user's own answer is theirs to write, so the AI never sets it.
      await saveQuestion(
        { set: setName, question: q.question, english: q.english, suggested: q.suggested, words: q.words, level: q.level, tags: [...(q.tags ?? []), AI_TAG] },
        undefined,
        database,
      )
      added++
    }
    return { set: setName, added, skipped }
  })
}

function describeTopic(topic: GrammarTopic): GrammarTopicSummary {
  return { id: topic.id, title: topic.title, english: topic.english, level: topic.level, group: topic.group, exercises: topic.exercises.length }
}

async function listGrammarTopics(_params: unknown, database: LernzeitDB): Promise<GrammarTopicSummary[]> {
  return (await database.grammarTopics.orderBy('createdAt').toArray()).map(describeTopic)
}

/**
 * Adds a grammar topic, or exercises and examples to one. An existing topic
 * keeps its title, section and rule; a rule is only filled in when it has none.
 */
async function addGrammar(params: AddGrammarParams, database: LernzeitDB): Promise<AddGrammarResult> {
  const { topic: name, english, group, level, summary, rule, examples = [], exercises = [] } = params
  const title = name.trim().replace(/\s+/g, ' ')
  if (!title) throw invalid('Name the topic.')
  if (title.length > MAX_GRAMMAR_TEXT) throw invalid(`Keep the topic title under ${MAX_GRAMMAR_TEXT} characters.`)
  if (exercises.length > MAX_GRAMMAR_EXERCISES_PER_CALL) throw invalid(`Send at most ${MAX_GRAMMAR_EXERCISES_PER_CALL} exercises per call.`)
  if (examples.length > MAX_GRAMMAR_EXAMPLES_PER_CALL) throw invalid(`Send at most ${MAX_GRAMMAR_EXAMPLES_PER_CALL} examples per call.`)
  if ((rule?.length ?? 0) > MAX_RULE_CHARS) throw invalid(`Keep the rule under ${MAX_RULE_CHARS} characters.`)
  if (level !== undefined && !parseLevel(level)) throw invalid('level must be one of A1, A2, B1, B2, C1 or C2.')
  exercises.forEach((e, i) => {
    if ([e.text, e.en, e.why].some((text) => (text?.length ?? 0) > MAX_GRAMMAR_TEXT)) throw invalid(`Keep exercise ${i + 1} under ${MAX_GRAMMAR_TEXT} characters per field.`)
    const problem = exerciseProblem(e.text)
    if (problem) throw invalid(`Exercise ${i + 1} ("${e.text.trim()}"): ${problem}.`)
  })
  examples.forEach((e, i) => {
    if (!e.de.trim()) throw invalid(`Example ${i + 1} needs text.`)
    if ([e.de, e.en].some((text) => (text?.length ?? 0) > MAX_GRAMMAR_TEXT)) throw invalid(`Keep example ${i + 1} under ${MAX_GRAMMAR_TEXT} characters.`)
  })

  return database.transaction('rw', [database.grammarTopics, database.exerciseStats], async () => {
    const topics = await database.grammarTopics.toArray()
    const existing = topics.find((t) => t.id === name) ?? topics.find((t) => key(t.title) === key(title))
    if (existing && !exercises.length && !examples.length && !rule?.trim()) throw invalid('Send exercises, examples or a rule to add to the topic.')
    if (!existing && !exercises.length && !rule?.trim()) throw invalid('A new topic needs a rule or some exercises.')

    const seen = new Set(existing?.exercises.map((e) => key(e.text)))
    const skipped: string[] = []
    const fresh = exercises.flatMap((e) => {
      if (seen.has(key(e.text))) {
        skipped.push(e.text.trim())
        return []
      }
      seen.add(key(e.text))
      return [{ id: newId(), text: e.text, en: e.en, why: e.why }]
    })
    const knownExamples = new Set(existing?.examples.map((e) => key(e.de)))
    const newExamples = examples.filter((e) => !knownExamples.has(key(e.de)) && knownExamples.add(key(e.de)))

    const saved = existing
      ? await saveTopic(
          {
            ...existing,
            rule: existing.rule.trim() ? existing.rule : (rule ?? ''),
            examples: [...existing.examples, ...newExamples],
            exercises: [...existing.exercises, ...fresh],
          },
          existing.id,
          database,
        )
      : await saveTopic(
          { title, english, group: group?.trim() || DEFAULT_GROUP, level, summary, rule: rule ?? '', examples: newExamples, exercises: fresh, drill: undefined },
          undefined,
          database,
        )
    return { topic: describeTopic(saved), created: !existing, added: fresh.length, skipped }
  })
}

async function createTaskAction(
  { title, description, priority = 'medium', status = 'todo', dueDate, topic }: CreateTaskParams,
  database: LernzeitDB,
): Promise<TaskSummary> {
  if (!title.trim()) throw invalid('A task needs a title.')
  if (dueDate && (!DATE_KEY_RE.test(dueDate) || Number.isNaN(Date.parse(dueDate)))) throw invalid('dueDate must be a date like 2026-10-20.')
  const linked = topic ? await findTopic(database, topic) : undefined
  const task = await createTask({ title, description, priority, status, dueDate, topicId: linked?.id }, database)
  return { id: task.id, title: task.title, status: task.status, priority: task.priority, dueDate: task.dueDate, topic: linked?.name }
}

async function logStudyTime({ topic, minutes, start, note }: LogStudyTimeParams, database: LernzeitDB): Promise<SessionSummary> {
  if (!(minutes > 0 && minutes <= MAX_STUDY_MINUTES)) throw invalid(`minutes must be more than 0 and at most ${MAX_STUDY_MINUTES}.`)
  const linked = await findTopic(database, topic)
  const now = Date.now()
  const startMs = start ? Date.parse(start) : now - minutes * MINUTE
  if (Number.isNaN(startMs)) throw invalid('start must be a local date and time like 2026-10-15T08:30.')
  const endMs = startMs + minutes * MINUTE
  if (endMs > now + MINUTE) throw invalid('Study time cannot end in the future.')
  await logManualSession({ topicId: linked.id, start: startMs, minutes, note }, database)
  return { topic: linked.name, minutes, start: localDateTime(startMs), end: localDateTime(endMs) }
}

/* ------------------------------------------------------------ Dispatch ---- */

type Handler<A extends ActionName> = (params: ActionParams<A>, database: LernzeitDB) => Promise<ActionResult<A>>

const handlers: { [A in ActionName]: Handler<A> } = {
  list_topics: listTopics,
  list_decks: listDecks,
  list_cards: listCards,
  create_deck: createDeckAction,
  create_cards: createCards,
  move_cards: moveCards,
  delete_cards: deleteCards,
  delete_deck: deleteDeckAction,
  create_story: createStory,
  create_questions: createQuestions,
  list_grammar_topics: listGrammarTopics,
  add_grammar: addGrammar,
  create_task: createTaskAction,
  log_study_time: logStudyTime,
}

export function runAction<A extends ActionName>(action: A, params: ActionParams<A>, database: LernzeitDB = db): Promise<ActionResult<A>> {
  const handler: Handler<A> = handlers[action]
  return handler(params, database)
}

/** Runs a request from the MCP server and turns the outcome, error or not, into a response. */
export async function handleRequest({ id, action, params }: RequestMessage, database: LernzeitDB = db): Promise<ResponseMessage> {
  try {
    if (!Object.hasOwn(handlers, action)) throw invalid(`Unknown action "${action}".`)
    return { type: 'response', id, ok: true, result: await runAction(action, params, database) }
  } catch (error) {
    return { type: 'response', id, ok: false, error: toErrorBody(error) }
  }
}
