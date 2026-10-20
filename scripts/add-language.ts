#!/usr/bin/env node
/**
 * `npm run lang:add -- <code>`: starts a language pack in src/languages/<code>.
 *
 * Writes the pack's files with empty lists to fill in. The app finds the
 * folder by itself and offers the language in Welcome; `npm test` checks the
 * pack and says what is still missing.
 *
 * Runs with Node's type stripping, outside the Vite build, so it uses only
 * erasable TypeScript and relative imports with extensions.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const LANGUAGES = fileURLToPath(new URL('../src/languages', import.meta.url))

const USAGE = `Usage: npm run lang:add -- <code> [options]

Starts a language pack in src/languages/<code>, such as "it" for Italian.

  --name <name>       English name, shown in the app (default: from the code)
  --endonym <name>    The name in the language itself (default: from the code)
  --speech <tag>      Voice language, such as it-IT (default: the code)
  --native <codes>    Native languages the pack explains in, comma-separated (default: en)
  --levels <levels>   Levels it will have, comma-separated (default: A1)
  --rtl               Written right to left
  -h, --help          Show this help`

export interface PackOptions {
  code: string
  name: string
  endonym: string
  speech: string
  natives: string[]
  levels: string[]
  rtl: boolean
}

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const CODE_RE = /^[a-z]{2,3}$/

function displayName(code: string, locale: string): string | undefined {
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(code)
    return name && name !== code ? name[0].toLocaleUpperCase(locale) + name.slice(1) : undefined
  } catch {
    return undefined
  }
}

/** The options from the command line, with defaults; throws a readable message when one is wrong. */
export function packOptions(args: string[]): PackOptions {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      name: { type: 'string' },
      endonym: { type: 'string' },
      speech: { type: 'string' },
      native: { type: 'string' },
      levels: { type: 'string' },
      rtl: { type: 'boolean', default: false },
    },
  })
  const code = positionals[0]?.toLowerCase() ?? ''
  if (!CODE_RE.test(code) || positionals.length > 1) throw new Error('Give one language code of two or three letters, such as "it".')
  const list = (text: string | undefined, fallback: string[]) => (text ? text.split(',').map((s) => s.trim()).filter(Boolean) : fallback)
  const natives = list(values.native, ['en']).map((n) => n.toLowerCase())
  const bad = natives.find((n) => !CODE_RE.test(n))
  if (bad) throw new Error(`"${bad}" is not a language code.`)
  if (natives.includes(code)) throw new Error('A pack explains in other languages than its own: leave its code out of --native.')
  const levels = list(values.levels, ['A1']).map((l) => l.toUpperCase())
  const level = levels.find((l) => !LEVELS.includes(l))
  if (level) throw new Error(`"${level}" is not a level. Use ${LEVELS.join(', ')}.`)
  const name = values.name ?? displayName(code, 'en')
  if (!name) throw new Error(`The name of "${code}" is not known here. Add it with --name.`)
  return {
    code,
    name,
    endonym: values.endonym ?? displayName(code, code) ?? name,
    speech: values.speech ?? code,
    natives,
    levels: LEVELS.filter((l) => levels.includes(l)),
    rtl: values.rtl ?? false,
  }
}

const quote = (s: string) => `'${s.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
const quoteList = (items: string[]) => `[${items.map(quote).join(', ')}]`

/** The pack's files, by name. */
export function packFiles(o: PackOptions): Record<string, string> {
  const level = o.levels[0]
  // Plain strings are English; other natives need a map with each of them.
  const english = o.natives.length === 1 && o.natives[0] === 'en'
  const meaning = (text: string) => (english ? quote(text) : `{ ${o.natives.map((n) => `${n}: ${quote(`${text} (${n})`)}`).join(', ')} }`)
  return {
    'info.ts': `import type { PackInfo } from '../types'

export const info: PackInfo = {
  code: ${quote(o.code)},
  name: ${quote(o.name)},
  endonym: ${quote(o.endonym)},
  speech: ${quote(o.speech)},${o.rtl ? '\n  rtl: true,' : ''}
  // A short sentence to test the voice with, in ${o.name}.
  sample: '',
  // Letters a keyboard may lack, offered as buttons when typing answers.
  letters: [],
  natives: ${quoteList(o.natives)},
  levels: ${quoteList(o.levels)},
}
`,
    'content.ts': `import type { PackContent } from '../types'
import { GRAMMAR } from './grammar'
import { QUESTIONS, STORIES } from './texts'
import { CARDS, DECKS } from './words'

export const content: PackContent = {
  decks: DECKS,
  cards: CARDS,
  stories: STORIES,
  questions: QUESTIONS,
  grammar: GRAMMAR,
}
`,
    'words.ts': `import { sentences, words } from '../build'
import type { PackCard, PackDeck } from '../types'

export const DECKS: PackDeck[] = [
  { id: '${o.code}-words', name: '${o.name} Words', directions: { imageToDe: true, enToDe: true, deToEn: true } },
  { id: '${o.code}-sentences', name: '${o.name} Everyday Sentences', directions: { imageToDe: false, enToDe: true, deToEn: true } },
]

/**
 * One row per card: [number, word, meaning, part of speech, emoji, example, its meaning].
 * Write nouns with their article. The numbers become ids (${o.code}-0001) and never change.
${english ? ' * Meanings are English.' : ` * Meanings are maps with ${o.natives.join(', ')}, as in src/languages/en.`}
 */
export const CARDS: PackCard[] = [
  ...words('${o.code}', '${o.code}-words', '${level}', [
    // [1, 'word', ${meaning('meaning')}, 'noun', '🐕', 'An example sentence.', ${meaning('Its meaning.')}],
  ]),
  ...sentences('${o.code}', '${o.code}-sentences', '${level}', [
    // [501, 'An everyday sentence.', ${meaning('Its meaning.')}],
  ]),
]
`,
    'texts.ts': `// Uncomment with the first story or question.
// import { questionSet, story } from '../build'
import type { PackQuestion, PackStory } from '../types'

/** Short stories; a blank line starts a paragraph, and the translation has as many. */
export const STORIES: PackStory[] = [
  // story('${o.code}', 1, '${level}', 'Title', \`First paragraph.\\n\\nSecond paragraph.\`, ${meaning('Translation, paragraph by paragraph.')}, 'everyday'),
]

/** Speaking questions in sets: [number, question, meaning, suggested answer, useful words]. */
export const QUESTIONS: PackQuestion[] = [
  // ...questionSet('${o.code}', 'Set name in ${o.name}', '${level}', [
  //   [1, 'What is your name?', ${meaning('Its meaning.')}, 'A suggested answer.', ['word', 'word', 'word']],
  // ]),
]
`,
    'grammar.ts': `// Uncomment with the first topic.
// import { lines, topic } from '../build'
import type { PackGrammarTopic } from '../types'

/**
 * Grammar topics with a rule, examples and exercises. An exercise is one of:
 * {{right|wrong|wrong}} to pick, {{typed}} to type, {{wrong>right}} to find the
 * mistake, "~ sentence" to put in order, "prompt => answer" to write.
 * See src/languages/fr/grammar.ts for a whole pack.
 */
export const GRAMMAR: PackGrammarTopic[] = [
  // topic('${o.code}', 1, {
  //   level: '${level}', title: 'Title in ${o.name}', meaning: ${meaning('What it is about')}, group: 'Verbs',
  //   summary: ${meaning('One line under the title.')},
  //   rule: ${english ? "lines('The rule, with **bold** words.', '', '| a | b |', '|---|---|', '| 1 | 2 |')" : meaning('The rule.')},
  // }, [['An example.', ${meaning('Its meaning.')}]], [['A {{gap}} to fill.', ${meaning('Its meaning.')}, ${meaning('Why it is right.')}]]),
]
`,
  }
}

function main(args: string[]): number {
  if (args.includes('-h') || args.includes('--help')) {
    console.log(USAGE)
    return 0
  }
  let options: PackOptions
  try {
    options = packOptions(args)
  } catch (err) {
    console.error(`${err instanceof Error ? err.message : err}\n\n${USAGE}`)
    return 1
  }
  const folder = join(LANGUAGES, options.code)
  if (existsSync(folder)) {
    console.error(`There is a ${options.name} pack already: src/languages/${options.code}`)
    return 1
  }
  mkdirSync(folder)
  for (const [file, text] of Object.entries(packFiles(options))) writeFileSync(join(folder, file), text)
  console.log(`Started the ${options.name} pack in src/languages/${options.code}.

1. Fill in words.ts, texts.ts and grammar.ts, and the sample sentence in info.ts.
2. Run npm test: it checks every pack and lists what is missing.
3. Run npm run dev: Welcome offers ${options.name} when Lernzeit has nothing to learn yet.`)
  return 0
}

// Run only from the command line, not when the tests import it.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2))
