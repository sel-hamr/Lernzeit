import type { CallToolResult, McpServer, ToolAnnotations } from '@modelcontextprotocol/server'
import * as z from 'zod'
import {
  MAX_CARDS_PER_CALL,
  MAX_CARDS_PER_LIST,
  MAX_DOC_CHARS,
  MAX_DOC_TITLE,
  MAX_DOCS_PER_LIST,
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
  type NewCard,
  type NewGrammarExercise,
  type NewQuestion,
} from '../../src/bridge/protocol.ts'
import type { StoryLevel, StoryWord } from '../../src/db/types.ts'
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

const noteText = z.string().min(1).max(MAX_STORY_WORD_TEXT)

const storyWord = z.object({
  word: noteText.describe('One word, copied exactly from the story.'),
  sentence: z.string().min(1).max(MAX_STORY_SENTENCE).describe('The whole sentence it appears in, copied exactly from the story.'),
  alsoTap: z.array(noteText).optional().describe('Other words in that sentence that belong to it, such as the ein in "steigt ... ein".'),
  baseForm: noteText.describe('The dictionary form. For a noun, leave out the article and set gender.'),
  gender: z.enum(['der', 'die', 'das']).optional().describe('Article of a noun.'),
  partOfSpeech: noteText.describe('The word type: noun, verb, adjective, article, preposition…'),
  translation: noteText.describe("The short meaning in the student's language."),
  meaning: noteText.optional().describe('One simple line that explains the word. Do not just repeat the translation. Leave it out on a short note.'),
  grammar: z
    .object({
      rule: noteText.describe('The rule, in one short sentence.'),
      why: noteText.describe('One or two short sentences on why the rule applies in this sentence: ending, case, tense or word order.'),
      example: z
        .object({
          text: noteText.describe('One new, easy sentence that uses the same rule.'),
          translation: noteText.describe('Its translation.'),
        })
        .describe('A new example of the rule.'),
    })
    .optional()
    .describe("Why the word has this form. Leave it out when the word's form has nothing to explain."),
  tip: noteText.optional().describe('One short tip or memory trick. Leave it out on a short note.'),
}) satisfies z.ZodType<StoryWord>

const CREATE_STORY_DESCRIPTION = `Saves a story for the student to read in Lernzeit, with teaching notes for every word that needs one. When the student taps a word, the app shows your note and can read the word aloud. The app has no AI of its own, so a word without a note gets no grammar help.

Write the story in the language the student is learning (German unless they say otherwise). Write the translation and all notes in the student's own language (English unless they say otherwise).

WHO YOU ARE
You are a smart, patient teacher. Your student is a beginner who gets bored or confused easily. Never assume they know any grammar words.

HOW TO WRITE EVERY NOTE
- Use very simple words and short sentences.
- Avoid jargon. If you need a grammar word, explain it right away: "the accusative (the form for the thing getting the action)".
- Teach with examples and comparisons, not theory. Compare with English when it helps.
- Talk about this sentence, not grammar in general.
- Be warm, fun and encouraging. Never make the student feel slow.
- Put the words being explained in **bold**.

Bad: "Accusative masculine indefinite article after a transitive verb."
Good: "What does Lena buy? A coffee. **Kaffee** is a der word, so **ein** becomes **einen**."

WHICH WORDS TO EXPLAIN
Explain every word that needs help, up to ${MAX_STORY_WORDS} notes, and skip the rest. Never write a note just to fill the list.
- Full note, with meaning, grammar and tip: new or hard words, words whose ending or form changes, and words in a surprising place in the sentence.
- Short note, with only word, sentence, baseForm, partOfSpeech and translation: simple words where a translation is all the student needs.
- No note: names, and words the student surely knows at this level, such as und, ich or ist.
One note per word is enough, because it also shows on the same word in other sentences. If the same word does a different job in another sentence, give it another note. If the story has more than ${MAX_STORY_WORDS} different words, keep the ones that help most.

HOW TO FILL IN EACH WORD
- word: one word, copied exactly from the story.
- sentence: the whole sentence it appears in, copied exactly.
- alsoTap: other words in that sentence that belong to it, such as the ein in "steigt ... ein".
- baseForm: the dictionary form. For a noun, leave out the article and set gender.
- partOfSpeech: the word type, such as noun, verb or adjective.
- translation: the short meaning in the student's language.
- meaning: one simple line that explains the word. Do not just repeat the translation.
- grammar.rule: the rule in one short sentence.
- grammar.why: one or two short sentences on why the rule applies in this sentence (ending, case, tense or word order).
- grammar.example: one new, easy sentence that uses the same rule, with its translation.
- tip: one short tip or memory trick.
Leave out grammar when the word's form has nothing to explain, and leave out meaning and tip on short notes. Never fill a field with something vague.

BEFORE YOU SEND
- Check that the story and every example are correct and natural.
- Check that each rule is true. If you are not sure about a rule, leave out grammar for that word.

AFTER YOU SEND
The result says how many notes were saved and lists any it skipped, with the reason. Fix those and send the same story text again with all the notes. Sending the same text never makes a copy: it returns the saved story and replaces its notes if you include words. Each story gets the tag "ai".`

const cardRefs = z
  .array(z.string().min(1))
  .min(1)
  .max(MAX_CARDS_PER_CALL)
  .describe(
    'Each card by its id from list_cards (safest), or by its German text as in create_cards, e.g. ["Hund", "Ich {{gehe}} nach Hause."]. ' +
      'Text ignores case and a leading article, and names every card in the deck with that text.',
  )

const storyLevel =z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) satisfies z.ZodType<StoryLevel>

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
    'list_cards',
    {
      title: 'List flashcards',
      description: `Reads flashcards with all their fields and an id, in deck order, up to ${MAX_CARDS_PER_LIST} at a time. "total" says how many match; pass offset to read the next page. Review progress is not included.`,
      inputSchema: z.object({
        browser: browserField,
        deck: z.string().min(1).optional().describe('Deck name or id, from list_decks. Leave it out to read every deck.'),
        search: z.string().optional().describe('Text in the German, with its article, or in the English, ignoring case, e.g. "der hund" or "dog".'),
        tag: z.string().optional().describe('Only cards with this tag, e.g. "ai" or "A1".'),
        limit: z.number().int().min(1).max(MAX_CARDS_PER_LIST).optional().describe(`Defaults to ${MAX_CARDS_PER_LIST}.`),
        offset: z.number().int().min(0).optional().describe('Cards to skip, for the next page. Defaults to 0.'),
      }),
      annotations: look,
    },
    ({ browser, ...params }) => forward(browser, 'list_cards', params),
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
    'move_cards',
    {
      title: 'Move flashcards',
      description: `Moves up to ${MAX_CARDS_PER_CALL} flashcards to another deck, keeping their review progress. A card whose German text the target deck already has stays where it is and is listed under "skipped". Cards that match nothing are listed under "notFound".`,
      inputSchema: z.object({
        browser: browserField,
        deck: z.string().min(1).describe('Deck name or id the cards are in, from list_decks.'),
        to: z.string().min(1).describe('Deck name or id to move them to. Create it first with create_deck if it is new.'),
        cards: cardRefs,
      }),
      annotations: { ...add, idempotentHint: true },
    },
    ({ browser, ...params }) => forward(browser, 'move_cards', params),
  )

  server.registerTool(
    'delete_cards',
    {
      title: 'Delete flashcards',
      description: `Deletes up to ${MAX_CARDS_PER_CALL} flashcards from a deck with all their review progress. This cannot be undone, so ask the user first. Cards that match nothing are listed under "notFound".`,
      inputSchema: z.object({
        browser: browserField,
        deck: z.string().min(1).describe('Deck name or id, from list_decks.'),
        cards: cardRefs,
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    ({ browser, ...params }) => forward(browser, 'delete_cards', params),
  )

  server.registerTool(
    'delete_deck',
    {
      title: 'Delete a deck',
      description:
        'Deletes a deck with all its cards and their review progress. This cannot be undone, so tell the user the deck and how many cards it has, and ask first. ' +
        'cardCount must match the deck, or nothing is deleted.',
      inputSchema: z.object({
        browser: browserField,
        deck: z.string().min(1).describe('Deck name or id, from list_decks.'),
        cardCount: z.number().int().min(0).describe('The number of cards in the deck, from list_decks, as you told the user.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    ({ browser, ...params }) => forward(browser, 'delete_deck', params),
  )

  server.registerTool(
    'create_story',
    {
      title: 'Add a story',
      description: CREATE_STORY_DESCRIPTION,
      inputSchema: z.object({
        browser: browserField,
        title: z.string().min(1).max(MAX_STORY_TITLE).describe('German title, e.g. "Im Café".'),
        text: z.string().min(1).max(MAX_STORY_CHARS).describe('The story. Separate paragraphs with an empty line.'),
        translation: z
          .string()
          .max(MAX_STORY_CHARS)
          .optional()
          .describe('Translation with the same paragraphs, so each one can show under its story paragraph.'),
        level: storyLevel.optional().describe('CEFR level of the text.'),
        tags: z.array(z.string()).optional().describe('Extra tags, e.g. ["food"]. The tag "ai" is always added.'),
        topic: topicField.optional().describe('Topic that reading time counts toward. Defaults to the topic of the first deck, usually German.'),
        words: z.array(storyWord).max(MAX_STORY_WORDS).optional().describe('Teaching notes on the words that need one: full notes on hard words, short notes on simple ones.'),
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
    'list_docs',
    {
      title: 'List docs',
      description: 'Lists the folders on the Docs page and the docs that match, without their text. Docs are general reading the user saved, not study material. Call read_doc for a doc\'s text.',
      inputSchema: z.object({
        browser: browserField,
        folder: z.string().min(1).optional().describe('Folder path, e.g. "Recipes/Italian". Docs in the folders inside it count too. Leave it out for every doc.'),
        search: z.string().min(1).optional().describe('Text to find in the title, tags or text, ignoring case.'),
        tag: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(MAX_DOCS_PER_LIST).optional().describe(`Defaults to ${MAX_DOCS_PER_LIST}.`),
        offset: z.number().int().min(0).optional(),
      }),
      annotations: look,
    },
    ({ browser, ...params }) => forward(browser, 'list_docs', params),
  )

  server.registerTool(
    'read_doc',
    {
      title: 'Read a doc',
      description: 'Returns one doc with its Markdown text. Only read a doc the user asked about.',
      inputSchema: z.object({
        browser: browserField,
        doc: z.string().min(1).describe('Doc id from list_docs, or its exact title.'),
      }),
      annotations: look,
    },
    ({ browser, ...params }) => forward(browser, 'read_doc', params),
  )

  server.registerTool(
    'create_doc',
    {
      title: 'Save a doc',
      description: 'Saves Markdown text on the Docs page, shown like a README. It is marked "To read" and tagged "ai". Saving the same text in the same folder again adds nothing. Existing docs cannot be changed.',
      inputSchema: z.object({
        browser: browserField,
        title: z.string().min(1).max(MAX_DOC_TITLE).optional().describe('Leave it out to use the first heading of the text.'),
        body: z.string().min(1).max(MAX_DOC_CHARS).describe('The text in GitHub-style Markdown: headings, lists, tables, task lists, code blocks, links and web images. Raw HTML is not shown.'),
        folder: z.string().min(1).optional().describe('Folder path, e.g. "Recipes/Italian". Folders that are missing are made. Leave it out for the top level.'),
        tags: z.array(z.string()).optional().describe('Extra tags. The tag "ai" is always added.'),
      }),
      annotations: { ...add, idempotentHint: true },
    },
    ({ browser, ...params }) => forward(browser, 'create_doc', params),
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
