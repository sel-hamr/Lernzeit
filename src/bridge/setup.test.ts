import { describe, expect, it } from 'vitest'
import { claudeCodeCommand, claudeDesktopEntry, generateToken, serverEnv } from './setup'

const local = { token: 'abc-123', port: 47821, origin: 'http://localhost:5173', serverPath: 'C:/Lernzeit/mcp/src/index.ts' }

describe('serverEnv', () => {
  it('needs only the token for the defaults', () => {
    expect(serverEnv(local)).toEqual({ LERNZEIT_TOKEN: 'abc-123' })
  })

  it('adds the port and the origin when they differ from the defaults', () => {
    expect(serverEnv({ ...local, port: 50000, origin: 'https://lernzeit.example' })).toEqual({
      LERNZEIT_TOKEN: 'abc-123',
      LERNZEIT_PORT: '50000',
      LERNZEIT_ORIGINS: 'https://lernzeit.example',
    })
  })
})

describe('claudeDesktopEntry', () => {
  it('is a "lernzeit" entry that pastes inside mcpServers', () => {
    const entry = claudeDesktopEntry(local)
    expect(entry.startsWith('"lernzeit": {')).toBe(true)
    expect(JSON.parse(`{${entry}}`)).toEqual({
      lernzeit: { command: 'node', args: ['C:/Lernzeit/mcp/src/index.ts'], env: { LERNZEIT_TOKEN: 'abc-123' } },
    })
  })
})

describe('claudeCodeCommand', () => {
  it('passes each variable with -e and quotes the path', () => {
    expect(claudeCodeCommand({ ...local, port: 50000 })).toBe(
      'claude mcp add lernzeit -e LERNZEIT_TOKEN=abc-123 -e LERNZEIT_PORT=50000 -- node "C:/Lernzeit/mcp/src/index.ts"',
    )
  })
})

describe('generateToken', () => {
  it('makes a different random token each time', () => {
    const token = generateToken()
    expect(token).toMatch(/^[0-9a-f-]{36}$/)
    expect(generateToken()).not.toBe(token)
  })
})
