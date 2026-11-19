/**
 * Turns a Lernzeit backup into the German starter file the welcome screen
 * installs: decks, cards (with their pictures), stories, speaking questions
 * and grammar topics. Everything personal is dropped: study sessions,
 * review progress and logs, practice history, answers, scores, tasks,
 * topics, settings and read counts.
 *
 *   node scripts/make-starter.ts <backup.json> [public/starter/german.json]
 */
import { readFileSync, writeFileSync } from 'node:fs'

type Row = Record<string, unknown>

interface Backup {
  app: string
  decks: Row[]
  cards: Row[]
  stories?: Row[]
  questions?: Row[]
  grammarTopics?: Row[]
  images: { id: string; dataUrl: string }[]
}

/** Copies the listed fields that have a value. */
function pick(row: Row, fields: string[]): Row {
  const out: Row = {}
  for (const field of fields) {
    const value = row[field]
    if (value !== undefined && value !== null && value !== '') out[field] = value
  }
  return out
}

const TOPIC = 'German'

export function makeStarter(backup: Backup) {
  if (backup.app !== 'lernzeit') throw new Error('This is not a Lernzeit backup file')
  const images = new Map(backup.images.map((img) => [img.id, img.dataUrl]))
  const decks = [...backup.decks].sort((a, b) => Number(a.order) - Number(b.order))
  return {
    format: 'lernzeit-starter',
    version: 1,
    topic: TOPIC,
    pack: {
      format: 'lernzeit-cards',
      version: 1,
      decks: decks.map((d) => ({ ...pick(d, ['id', 'name', 'directions', 'newPerDay', 'reviewsPerDay']), topic: TOPIC })),
      cards: [...backup.cards]
        .sort((a, b) => Number(a.createdAt) - Number(b.createdAt))
        .map((c) => {
          const image = typeof c.imageId === 'string' ? images.get(c.imageId) : undefined
          return {
            ...pick(c, ['id', 'deckId', 'type', 'english', 'german', 'gender', 'plural', 'verbForms', 'conjugation', 'partOfSpeech', 'exampleDe', 'exampleEn', 'tags', 'emoji', 'imageQuery']),
            ...(image ? { image } : {}),
          }
        }),
    },
    // Newest first, as the Stories page lists them; installing keeps this order.
    stories: [...(backup.stories ?? [])]
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
      .map((s) => ({ ...pick(s, ['id', 'title', 'text', 'translation', 'level', 'tags', 'words']), topic: TOPIC })),
    questions: [...(backup.questions ?? [])]
      .sort((a, b) => Number(a.createdAt) - Number(b.createdAt))
      .map((q) => pick(q, ['id', 'set', 'question', 'english', 'suggested', 'words', 'level', 'tags'])),
    grammarTopics: [...(backup.grammarTopics ?? [])]
      .sort((a, b) => Number(a.createdAt) - Number(b.createdAt))
      .map((t) => pick(t, ['id', 'title', 'english', 'group', 'level', 'summary', 'drill', 'rule', 'examples', 'exercises'])),
  }
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/').replace(/^(?=[A-Za-z]:)/, '/')}`) {
  const [input, output = 'public/starter/german.json'] = process.argv.slice(2)
  if (!input) {
    console.error('Usage: node scripts/make-starter.ts <backup.json> [output.json]')
    process.exit(1)
  }
  const starter = makeStarter(JSON.parse(readFileSync(input, 'utf8')))
  writeFileSync(output, JSON.stringify(starter))
  const p = starter.pack
  console.log(`Wrote ${output}: ${p.decks.length} decks, ${p.cards.length} cards, ${starter.stories.length} stories, ${starter.questions.length} questions, ${starter.grammarTopics.length} grammar topics`)
}
