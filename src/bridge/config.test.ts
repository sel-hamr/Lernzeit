import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { LernzeitDB } from '@/db/db'
import { exportBackup, restoreBackup } from '@/data/io'
import { browserKind, DEFAULT_BRIDGE_CONFIG, getBridgeConfig, updateBridgeConfig } from './config'

const databases: LernzeitDB[] = []
const freshDb = () => {
  const database = new LernzeitDB(`bridge-config-${databases.length}`)
  databases.push(database)
  return database
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((d) => d.delete()))
})

describe('bridge config', () => {
  it('starts off and saves changes', async () => {
    const database = freshDb()
    expect(await getBridgeConfig(database)).toEqual(DEFAULT_BRIDGE_CONFIG)
    await updateBridgeConfig({ enabled: true, token: 'secret' }, database)
    await updateBridgeConfig({ name: 'Edge Work' }, database)
    expect(await getBridgeConfig(database)).toEqual({ ...DEFAULT_BRIDGE_CONFIG, enabled: true, token: 'secret', name: 'Edge Work' })
  })

  it('stays with the browser: not in backups, and kept when one is restored', async () => {
    const source = freshDb()
    await updateBridgeConfig({ enabled: true, token: 'from-source', name: 'Chrome Personal' }, source)
    const backup = await exportBackup(source)
    expect(JSON.stringify(backup)).not.toContain('from-source')

    const target = freshDb()
    await updateBridgeConfig({ enabled: true, token: 'target-token', name: 'Edge' }, target)
    await restoreBackup(backup, target)
    expect(await getBridgeConfig(target)).toMatchObject({ token: 'target-token', name: 'Edge' })
  })
})

describe('browserKind', () => {
  it('tells Edge, Opera, Firefox, Chrome and Safari apart', () => {
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
    expect(browserKind(chrome)).toBe('Chrome')
    expect(browserKind(`${chrome} Edg/141.0.0.0`)).toBe('Edge')
    expect(browserKind(`${chrome} OPR/120.0.0.0`)).toBe('Opera')
    expect(browserKind('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0')).toBe('Firefox')
    expect(browserKind('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15')).toBe('Safari')
    expect(browserKind('curl/8.0')).toBe('Browser')
  })
})
