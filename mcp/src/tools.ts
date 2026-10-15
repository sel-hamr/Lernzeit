import type { CallToolResult, McpServer, ToolAnnotations } from '@modelcontextprotocol/server'
import * as z from 'zod'
import {
  MAX_CARDS_PER_CALL,
  MAX_STORY_CHARS,
  MAX_STORY_TITLE,
  MAX_STUDY_MINUTES,
  toErrorBody,
  type ActionName,
  type ActionParams,
  type NewCard,
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
  partOfSpeech: z.string().optional().describe('noun, verb, adjective… Only nouns are practised from the picture.'),
  exampleDe: z.string().optional().describe('A short German example sentence.'),
  exampleEn: z.string().optional().describe('Its English translation.'),
  tags: z.array(z.string()).optional().describe('Extra tags, e.g. ["A1", "food"]. The tag "ai" is always added.'),
  emoji: z.string().optional().describe('One emoji shown as the picture, for words that have a clear one.'),
  imageQuery: z.string().optional().describe('Search words for finding a photo later.'),
}) satisfies z.ZodType<NewCard>

const storyLevel = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) satisfies z.ZodType<StoryLevel>

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
