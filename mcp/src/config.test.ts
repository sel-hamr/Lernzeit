import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_PORT } from '../../src/bridge/protocol.ts'
import { readConfig } from './config.ts'

describe('readConfig', () => {
  it('needs a token', () => {
    assert.throws(() => readConfig({}), /LERNZEIT_TOKEN is not set/)
    assert.throws(() => readConfig({ LERNZEIT_TOKEN: '  ' }), /LERNZEIT_TOKEN is not set/)
  })

  it('uses the default port and the local dev origins', () => {
    const config = readConfig({ LERNZEIT_TOKEN: 'secret' })
    assert.equal(config.token, 'secret')
    assert.equal(config.port, DEFAULT_PORT)
    assert.ok(config.origins.has('http://localhost:5173'))
    assert.ok(config.origins.has('http://127.0.0.1:4173'))
  })

  it('adds extra origins without a trailing slash', () => {
    const config = readConfig({ LERNZEIT_TOKEN: 'secret', LERNZEIT_ORIGINS: 'https://lernzeit.example/, https://other.example' })
    assert.ok(config.origins.has('https://lernzeit.example'))
    assert.ok(config.origins.has('https://other.example'))
    assert.ok(config.origins.has('http://localhost:5173'))
  })

  it('rejects a port that is not a number', () => {
    assert.throws(() => readConfig({ LERNZEIT_TOKEN: 'secret', LERNZEIT_PORT: 'abc' }), /LERNZEIT_PORT must be a port number/)
    assert.equal(readConfig({ LERNZEIT_TOKEN: 'secret', LERNZEIT_PORT: '50000' }).port, 50_000)
  })
})
