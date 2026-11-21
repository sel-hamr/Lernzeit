/*
 * What syncs with the cloud, and the rules every side of sync shares: the
 * Worker, the web app and the phone app. Newest `updatedAt` wins per record.
 */
import type { ImageFit, Settings, StoredImage } from './types'

/** The synced tables. kv comes last: only some of its keys sync. */
export const SYNC_TABLES = [
  'topics',
  'sessions',
  'decks',
  'cards',
  'reviews',
  'reviewLogs',
  'images',
  'tasks',
  'stories',
  'questions',
  'responses',
  'drillStats',
  'grammarTopics',
  'exerciseStats',
  'practiceRuns',
  'docFolders',
  'docs',
  'kv',
] as const

export type SyncTable = (typeof SYNC_TABLES)[number]

/** The kv keys that sync. Every other key stays on its device. */
export const SYNCED_KV_KEYS = ['settings', 'activeTimer', 'seeded', 'starterConjugations', 'starterGrammar', 'starterOffer'] as const

/** Settings that belong to one device: its voices, its look and its reminders. */
export const DEVICE_SETTING_KEYS = [
  'voiceEngine',
  'voiceURI',
  'speechRate',
  'theme',
  'remindersEnabled',
  'reminderTimes',
] as const satisfies readonly (keyof Settings)[]

/** One record's change. A delete has `data` null and `deleted` true. */
export interface SyncChange {
  tbl: SyncTable
  id: string
  data: unknown | null
  updatedAt: number
  deleted: boolean
}

/** A change as the server hands it out, numbered in the order it was stored. */
export interface PulledChange extends SyncChange {
  seq: number
}

export interface PullResponse {
  changes: PulledChange[]
  cursor: string
  more: boolean
}

export interface PushResponse {
  applied: number
}

export const MAX_PUSH_CHANGES = 500
export const MAX_PUSH_BYTES = 1_500_000
export const MAX_PULL_CHANGES = 500
export const MAX_RECORD_BYTES = 1_000_000
export const MAX_IMAGE_BYTES = 1_500_000
export const MAX_ID_LENGTH = 200

const tables = new Set<string>(SYNC_TABLES)
const kvKeys = new Set<string>(SYNCED_KV_KEYS)
const deviceKeys = new Set<string>(DEVICE_SETTING_KEYS)

/** A record's id in sync: a kv row's key, every other row's id. */
export function recordId(tbl: SyncTable, row: object): string {
  return tbl === 'kv' ? (row as { key: string }).key : (row as { id: string }).id
}

export function isSynced(tbl: string, id: string): boolean {
  if (tbl === 'kv') return kvKeys.has(id)
  return tables.has(tbl)
}

/** Whether an incoming change replaces the current one. A tie goes to the later arrival. */
export function wins(incoming: { updatedAt: number }, current?: { updatedAt: number }): boolean {
  return !current || incoming.updatedAt >= current.updatedAt
}

/** What syncs of an image. Its bytes go up and down on their own. */
export interface ImageMeta {
  id: string
  width: number
  height: number
  fit: ImageFit
  type: string
}

export function imageMeta(img: StoredImage): ImageMeta {
  return { id: img.id, width: img.width, height: img.height, fit: img.fit, type: img.blob.type }
}

/** Settings split into the ones every device shares and the ones kept on this device. */
export function splitSettings(s: Partial<Settings>): { shared: Partial<Settings>; device: Partial<Settings> } {
  const shared: Record<string, unknown> = {}
  const device: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(s)) (deviceKeys.has(key) ? device : shared)[key] = value
  return { shared: shared as Partial<Settings>, device: device as Partial<Settings> }
}
