import type { CallToolResult, McpServer, ToolAnnotations } from '@modelcontextprotocol/server'
import * as z from 'zod'
import {
  MAX_CARDS_PER_CALL,
  MAX_GRAMMAR_EXAMPLES_PER_CALL,
  MAX_GRAMMAR_EXERCISES_PER_CALL,
  MAX_GRAMMAR_TEXT,
  MAX_HINT_WORDS,
  MAX_QUESTION_CHARS,
  MAX_QUESTIONS_PER_CALL,
  MAX_RULE_CHARS,
  MAX_SET_NAME,
  MAX_STORY_CHARS,
  MAX_STORY_TITLE,
  MAX_STUDY_MINUTES,
  toErrorBody,
  type ActionName,
  type ActionParams,
  type NewCard,
  type NewGrammarExercise,
  type NewQuestion,
} from '../../src/bridge/protocol.ts'
import type { StoryLevel } from '../../src/db/types.ts'
import type { BrowserHub } from './hub.ts'

const browserField = z
  .string()
  .min(1)
  .optional()
  .describe('Name of the Lernzeit browser, from list_browsers. Leave it out when only one is connected.')

const topicField = z.string().min(1).describe('Topic name from list_topics, e.g. "German".')

const newCard = z.object({
  english: z.string().min(1).describe('English meaning, e.g. "dog"'),
  german: z
    .string()
    .min(1)
    .describe('German text. For a noun, the word without its article ("Hund"). For a cloze card, mark the gap: "Ich {{gehe}} nach Hause."'),
  type: z.enum(['word', 'sentence', 'cloze']).optional().describe('Defaults to cloze when german has {{…}}, otherwise word.'),
  gender: z.enum(['der', 'die', 'das']).optional().describe('Article of a noun.'),
  plural: z.string().optional().describe('With its article, e.g. "die Hunde".'),
  verbForms: z.string().optional().describe('For verbs, e.g. "gehen – ging – ist gegangen".'),
  conjugation: z
    .object({
      present: z.string().optional(),
      past: z.string().optional(),
      perfect: z.string().optional(),
    })
    .optional()
    .describe(
      'For verbs: each tense as six forms separated by commas, for ich, du, er/sie/es, wir, ihr, sie. ' +
        'e.g. present "fahre, fährst, fährt, fahren, fahrt, fahren", perfect "bin gefahren, bist gefahren, ist gefahren, sind gefahren, seid gefahren, sind gefahren". ' +
        'Use – for a form that does not exist and / between two right spellings. Grammar practice in the app asks exactly these forms.',
    ),
  partOfSpeech: z.string().optional().describe('noun, verb, adjective… Only nouns are practised from the picture.'),
  exampleDe: z.string().optional().describe('A short German example sentence.'),
  exampleEn: z.string().optional().describe('Its English translation.'),
  tags: z.array(z.string()).optional().describe('Extra tags, e.g. ["A1", "food"]. The tag "ai" is always added.'),
  emoji: z.string().optional().describe('One emoji shown as the picture, for words that have a clear one.'),
  imageQuery: z.string().optional().describe('Search words for finding a photo later.'),
}) satisfies z.ZodType<NewCard>

const storyLevel = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) satisfies z.ZodType<StoryLevel>

const newQuestion = z.object({
  question: z.string().min(1).max(MAX_QUESTION_CHARS).describe('German question, e.g. "Was ist dein Beruf?"'),
  english: z.string().max(MAX_QUESTION_CHARS).optional().describe('Its English translation.'),
  suggested: z
    .string()
    .max(MAX_QUESTION_CHARS)
    .optional()
    .describe('A short model answer in German that shows the sentence pattern, e.g. "Ich bin Lehrerin."'),
  words: z
    .array(z.string().min(1).max(60))
    .max(MAX_HINT_WORDS)
    .optional()
    .describe('A few useful words for answering, shown as hints, e.g. ["Lehrer", "Ärztin", "arbeiten als"]. Nouns with their article.'),
  level: storyLevel.optional().describe('CEFR level of the question.'),
  tags: z.array(z.string()).optional().describe('Extra tags. The tag "ai" is always added.'),
}) satisfies z.ZodType<NewQuestion>

const grammarExercise = z.object({
  text: z
    .string()
    .min(1)
    .max(MAX_GRAMMAR_TEXT)
    .describe(
      'One German sentence with one task. Fill the gap with choices: "Ich helfe {{dem|den|der}} Mann." (the first is right). Typed gap: "Du {{fährst}} zu schnell." ' +
        'Find the mistake: "Ich helfe {{den>dem}} Mann." (shows den, the fix is dem; mark one whole word). Word order: "~ Ich gebe dem Mann das Buch." ' +
        '(" / " adds another right order). Write the sentence: "Ich esse Pizza. (Perfekt) => Ich habe Pizza gegessen."',
    ),
  en: z.string().max(MAX_GRAMMAR_TEXT).optional().describe('The English of the sentence.'),
  why: z.string().max(MAX_GRAMMAR_TEXT).optional().describe('One short sentence: why the answer is right, e.g. "helfen takes the dative: dem Mann."'),
}) satisfies z.ZodType<NewGrammarExercise>

const look: ToolAnnotations ={ readOnlyHint: true, openWorldHint: false }
const add: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }

function reply(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

function failure(error: unknown): CallToolResult {
  const { code, message } = toErrorBody(error)
  return { content: [{ type: 'text', text: `${message} [${code}]` }], isError: true }
}

export function registerTools(server: McpServer, hub: BrowserHub) {
  const forward = async <A extends ActionName>(browser: string | undefined, action: A, params: ActionParams<A>) => {
    try {
      return reply(await hub.request(browser, action, params))
    } catch (error) {
      return failure(error)
    }
  }

  server.registerTool(
    'list_browsers',
    {
      title: 'List connected browsers',
      description: 'Lists the browsers that have Lernzeit open with Connect to AI on. Each browser keeps its own data.',
      annotations: look,
    },
    () => reply(hub.list()),
  )

  server.registerTool(
    'list_topics',
    {
      title: 'List topics',
      description: 'Lists the study topics, such as German and AI. Study time and decks belong to a topic.',
      inputSchema: z.object({ browser: browserField }),
      annotations: look,
    },
    ({ browser }) => forward(browser, 'list_topics', {}),
  )

  server.registerTool(
    'list_decks',
    {
      title: 'List decks',
      description: 'Lists the flashcard decks with their topic and number of cards. Call it before create_cards to pick a deck.',
      inputSchema: z.object({ browser: browserField }),
      annotations: look,
    },
    ({ browser }) => forward(browser, 'list_decks', {}),
  )

  server.registerTool(
    'create_deck',
    {
      title: 'Create a deck',
      description: 'Creates a flashcard deck. If a deck with that name already exists, it is returned instead.',
      inputSchema: z.object({
        browser: browserField,
        name: z.string().min(1).describe('Deck name, e.g. "Food".'),
        topic: topicField.optional().describe('Topic whose study time the reviews count toward.'),
      }),
      annotations: { ...add, idempotentHint: true },
    },
    ({ browser, ...params }) => forward(browser, 'create_deck', params),
  )

  server.registerTool(
    'create_cards',
    {
      title: 'Add flashcards',
      description: `Adds up to ${MAX_CARDS_PER_CALL} flashcards to a deck. Each card is tagged "ai". A card whose German text is already in the deck is skipped and listed under "skipped".`,
      inputSchema: z.object({
        browser: browserField,
        deck: z.string().min(1).describe('Deck name or id, from list_decks.'),
        cards: z.array(newCard).min(1).max(MAX_CARDS_PER_CALL),
      }),
      annotations: { ...add, idempotentHint: true },
    },
    ({ browser, ...params }) => forward(browser, 'create_cards', params),
  )

  server.registerTool(
    'create_story',
    {
      title: 'Add a story',
      description:
        'Adds a short German story to read in Lernzeit. In the reader, words from the user\'s decks are highlighted, and tapping any word shows its card or adds it to a deck. Each story is tagged "ai". If a story with the same text exists, it is returned instead.',
      inputSchema: z.object({
        browser: browserField,
        title: z.string().min(1).max(MAX_STORY_TITLE).describe('German title, e.g. "Im Café".'),
        text: z.string().min(1).max(MAX_STORY_CHARS).describe('The story in German. Separate paragraphs with an empty line.'),
        translation: z
          .string()
          .max(MAX_STORY_CHARS)
          .optional()
          .describe('English translation with the same paragraphs, so each one can show under its German paragraph.'),
        level: storyLevel.optional().describe('CEFR level of the text.'),
        tags: z.array(z.string()).optional().describe('Extra tags, e.g. ["food"]. The tag "ai" is always added.'),
        topic: topicField.optional().describe('Topic that reading time counts toward. Defaults to the topic of the first deck, usually German.'),
      }),
      annotations: { ...add, idempotentHint: true },
    },
    ({ browser, ...params }) => forward(browser, 'create_story', params),
  )

  server.registerTool(
    'create_questions',
    {
      title: 'Add practice questions',
      description: `Adds up to ${MAX_QUESTIONS_PER_CALL} German questions to a set. The user practises them by typing an answer and comparing it with their own answer and the suggested one. Each question is tagged "ai". A question already in the set is skipped and listed under "skipped".`,
      inputSchema: z.object({
        browser: browserField,
        set: z.string().min(1).max(MAX_SET_NAME).describe('Set name, e.g. "Arbeit". A new name starts a new set.'),
        questions: z.array(newQuestion).min(1).max(MAX_QUESTIONS_PER_CALL),
      }),
      annotations: { ...add, idempotentHint: true },
    },
    ({ browser, ...params }) => forward(browser, 'create_questions', params),
  )

  server.registerTool(
    'list_grammar_topics',
    {
      title: 'List grammar topics',
      description: 'Lists the grammar topics with their level, section and number of exercises. Call it before add_grammar to add to an existing topic.',
      inputSchema: z.object({ browser: browserField }),
      annotations: look,
    },
    ({ browser }) => forward(browser, 'list_grammar_topics', {}),
  )

  server.registerTool(
    'add_grammar',
    {
      title: 'Add grammar',
      description: `Adds up to ${MAX_GRAMMAR_EXERCISES_PER_CALL} exercises and ${MAX_GRAMMAR_EXAMPLES_PER_CALL} examples to a grammar topic, found by title or id. A new title starts a new topic with the rule you give. An existing topic keeps its title and rule. An exercise the topic already has is skipped and listed under "skipped".`,
      inputSchema: z.object({
        browser: browserField,
        topic: z.string().min(1).max(MAX_GRAMMAR_TEXT).describe('Title or id from list_grammar_topics, e.g. "Dativ". A new German title starts a new topic.'),
        english: z.string().max(MAX_GRAMMAR_TEXT).optional().describe('For a new topic: its English name, e.g. "The dative case".'),
        group: z.string().max(60).optional().describe('For a new topic: its section, e.g. "Cases" or "Verbs".'),
        level: storyLevel.optional().describe('For a new topic: its CEFR level.'),
        summary: z.string().max(MAX_GRAMMAR_TEXT).optional().describe('For a new topic: one line under the title.'),
        rule: z
          .string()
          .max(MAX_RULE_CHARS)
          .optional()
          .describe('For a new topic: the explanation in plain text. A blank line starts a paragraph; "- " lines make a list; "| a | b |" lines a table, with "|---|---|" under the header; **bold**.'),
        examples: z
          .array(z.object({ de: z.string().min(1).max(MAX_GRAMMAR_TEXT), en: z.string().max(MAX_GRAMMAR_TEXT).optional() }))
          .max(MAX_GRAMMAR_EXAMPLES_PER_CALL)
          .optional(),
        exercises: z.array(grammarExercise).max(MAX_GRAMMAR_EXERCISES_PER_CALL).optional(),
      }),
      annotations: { ...add, idempotentHint: true },
    },
    ({ browser, ...params }) => forward(browser, 'add_grammar', params),
  )

  server.registerTool(
    'create_task',
    {
      title: 'Add a task',
      description: 'Adds a task to the Lernzeit board.',
      inputSchema: z.object({
        browser: browserField,
        title: z.string().min(1),
        description: z.string().optional(),
        priority: z.enum(['high', 'medium', 'low']).optional().describe('Defaults to medium.'),
        status: z.enum(['backlog', 'todo', 'doing', 'done']).optional().describe('Board column. Defaults to todo.'),
        dueDate: z.iso.date().optional().describe('YYYY-MM-DD'),
        topic: topicField.optional(),
      }),
      annotations: add,
    },
    ({ browser, ...params }) => forward(browser, 'create_task', params),
  )

  server.registerTool(
    'log_study_time',
    {
      title: 'Log study time',
      description: 'Saves study time done away from the timer. It counts toward the topic\'s daily goal and shows in History.',
      inputSchema: z.object({
        browser: browserField,
        topic: topicField,
        minutes: z.number().positive().max(MAX_STUDY_MINUTES),
        start: z.iso
          .datetime({ local: true })
          .optional()
          .describe('When the study started, in the user\'s local time: YYYY-MM-DDTHH:MM. Defaults to `minutes` before now.'),
        note: z.string().max(200).optional().describe('What was studied, in one line.'),
      }),
      annotations: add,
    },
    ({ browser, ...params }) => forward(browser, 'log_study_time', params),
  )
}
