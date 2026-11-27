import type { Card, CardReview, Deck, Doc, DocFolder, DrillStat, ExerciseStat, GrammarTopic, PracticeRun, Question, QuestionResponse, ReviewLog, Session, Settings, StoredImage, Story, Task, Topic } from './types'

/** The backup file: every table as JSON, images as data URLs. The web and the phone write and read the same one. */
export interface BackupImage {
  id: string
  width: number
  height: number
  fit: StoredImage['fit']
  dataUrl: string
}

export interface Backup {
  app: 'lernzeit'
  version: 1
  exportedAt: number
  topics: Topic[]
  sessions: Session[]
  decks: Deck[]
  cards: Card[]
  reviews: CardReview[]
  reviewLogs: ReviewLog[]
  tasks: Task[]
  /** Missing in backups made before stories were added. */
  stories?: Story[]
  /** Missing in backups made before questions were added. */
  questions?: Question[]
  responses?: QuestionResponse[]
  /** Missing in backups made before drills were added. */
  drillStats?: DrillStat[]
  /** Missing in backups made before grammar topics were added. */
  grammarTopics?: GrammarTopic[]
  exerciseStats?: ExerciseStat[]
  /** Missing in backups made before practice history was added. */
  practiceRuns?: PracticeRun[]
  /** Missing in backups made before docs were added. */
  docFolders?: DocFolder[]
  docs?: Doc[]
  images: BackupImage[]
  settings: Settings
}

export function assertBackup(value: unknown): asserts value is Backup {
  const b = value as Partial<Backup>
  const arrays: (keyof Backup)[] = ['topics', 'sessions', 'decks', 'cards', 'reviews', 'reviewLogs', 'tasks', 'images']
  if (!b || b.app !== 'lernzeit' || typeof b.version !== 'number') throw new Error('This is not a Lernzeit backup file')
  if (b.version > 1) throw new Error('This backup comes from a newer version of Lernzeit')
  for (const key of arrays) if (!Array.isArray(b[key])) throw new Error(`The backup is missing "${key}"`)
  for (const key of ['stories', 'questions', 'responses', 'drillStats', 'grammarTopics', 'exerciseStats', 'practiceRuns', 'docFolders', 'docs'] as const) {
    if (b[key] !== undefined && !Array.isArray(b[key])) throw new Error(`The backup has broken "${key}"`)
  }
}

/** Throws a readable error when a table of the backup holds one id twice. */
export function assertUniqueIds(backup: Backup): void {
  const tables = {
    topics: backup.topics, sessions: backup.sessions, decks: backup.decks, cards: backup.cards, reviews: backup.reviews,
    reviewLogs: backup.reviewLogs, tasks: backup.tasks, stories: backup.stories, questions: backup.questions, responses: backup.responses,
    drillStats: backup.drillStats, grammarTopics: backup.grammarTopics, exerciseStats: backup.exerciseStats, practiceRuns: backup.practiceRuns,
    docFolders: backup.docFolders, docs: backup.docs, images: backup.images,
  }
  for (const [name, rows] of Object.entries(tables)) {
    const seen = new Set<unknown>()
    for (const row of rows ?? []) {
      const id = (row as { id?: unknown } | null)?.id
      if (typeof id !== 'string') continue
      if (seen.has(id)) throw new Error(`The backup has "${name}" with the same id twice (${id}).`)
      seen.add(id)
    }
  }
}

