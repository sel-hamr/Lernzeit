import { describe, expect, it } from 'vitest'
import { claudeCodeArgs, desktopConfigPaths, pageOrigin, parseDesktopConfig, previousEnv, serverEntry, serverEnv, setupOptions, withServer } from './setup-mcp.ts'

const PATH = 'C:/Lernzeit/mcp/src/index.ts'

describe('mcp:setup options', () => {
  it('sets up both apps in the user scope by default', () => {
    expect(setupOptions([])).toEqual({ code: true, desktop: true, token: undefined, port: undefined, origins: undefined, scope: 'user', print: false })
  })

  it('sets up one app when it is named', () => {
    expect(setupOptions(['--code'])).toMatchObject({ code: true, desktop: false })
    expect(setupOptions(['--desktop', '--print'])).toMatchObject({ code: false, desktop: true, print: true })
  })

  it('tidies the token and the origins', () => {
    expect(setupOptions(['--token', ' abc ', '--origins', 'https://a.example/, ,https://b.example', '--port', '50000'])).toMatchObject({
      token: 'abc',
      origins: 'https://a.example,https://b.example',
      port: 50000,
    })
  })

  it('says what is wrong with the options', () => {
    expect(() => setupOptions(['--port', 'abc'])).toThrow('--port must be a port number')
    expect(() => setupOptions(['--port', '70000'])).toThrow('--port must be a port number')
    expect(() => setupOptions(['--scope', 'global'])).toThrow('--scope must be user, local, project')
    expect(() => setupOptions(['--token', ' '])).toThrow('--token is empty')
    expect(() => setupOptions(['--force'])).toThrow()
    expect(() => setupOptions(['https://a.example', 'https://b.example'])).toThrow('Give one address')
    expect(() => setupOptions(['not an address'])).toThrow('is not a web address')
  })

  it('takes the hosted address as a plain word, next to other options', () => {
    expect(setupOptions(['https://a.example', '--code'])).toMatchObject({ url: 'https://a.example', code: true, desktop: false })
    expect(setupOptions(['--code', 'https://a.example']).url).toBe('https://a.example')
  })
})

describe('pageOrigin', () => {
  it('keeps only what a browser sends as the origin', () => {
    expect(pageOrigin('https://lernzeit.example.workers.dev')).toBe('https://lernzeit.example.workers.dev')
    expect(pageOrigin(' https://Lernzeit.Example.dev/flashcards?x=1 ')).toBe('https://lernzeit.example.dev')
    expect(pageOrigin('http://192.168.1.5:4173/')).toBe('http://192.168.1.5:4173')
  })

  it('takes an address without a scheme as https', () => {
    expect(pageOrigin('lernzeit.example.workers.dev/')).toBe('https://lernzeit.example.workers.dev')
  })

  it('refuses what cannot be a page address', () => {
    expect(() => pageOrigin('ftp://a.example')).toThrow('must start with https:// or http://')
    expect(() => pageOrigin('')).toThrow('is not a web address')
  })
})

describe('serverEnv', () => {
  it('makes a new token and leaves out the defaults', () => {
    const env = serverEnv(setupOptions([]))
    expect(Object.keys(env)).toEqual(['LERNZEIT_TOKEN'])
    expect(env.LERNZEIT_TOKEN).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('keeps what was set before, unless an option changes it', () => {
    const before = { LERNZEIT_TOKEN: 'old', LERNZEIT_PORT: '50000', LERNZEIT_ORIGINS: 'https://a.example' }
    expect(serverEnv(setupOptions([]), before)).toEqual(before)
    expect(serverEnv(setupOptions(['--token', 'new', '--port', '47821']), before)).toEqual({ LERNZEIT_TOKEN: 'new', LERNZEIT_ORIGINS: 'https://a.example' })
  })

  it('adds the hosted address to the origins and keeps the token', () => {
    const before = { LERNZEIT_TOKEN: 'old', LERNZEIT_ORIGINS: 'https://a.example' }
    expect(serverEnv(setupOptions(['https://b.example']), before)).toEqual({ LERNZEIT_TOKEN: 'old', LERNZEIT_ORIGINS: 'https://a.example,https://b.example' })
    expect(serverEnv(setupOptions(['https://a.example/']), before)).toEqual(before)
    expect(serverEnv(setupOptions(['https://b.example']), { LERNZEIT_TOKEN: 'old' })).toEqual({ LERNZEIT_TOKEN: 'old', LERNZEIT_ORIGINS: 'https://b.example' })
  })
})

describe('Claude Desktop config', () => {
  const entry = serverEntry({ LERNZEIT_TOKEN: 'abc' }, PATH)

  it('adds the server and keeps everything else', () => {
    const config = parseDesktopConfig(JSON.stringify({ mcpServers: { other: { command: 'x' } }, preferences: { a: 1 } }))
    expect(JSON.parse(withServer(config, entry))).toEqual({
      mcpServers: { other: { command: 'x' }, lernzeit: { command: 'node', args: [PATH], env: { LERNZEIT_TOKEN: 'abc' } } },
      preferences: { a: 1 },
    })
  })

  it('replaces an old entry and reads its settings', () => {
    const config = parseDesktopConfig(JSON.stringify({ mcpServers: { lernzeit: { command: 'node', args: ['old'], env: { LERNZEIT_TOKEN: 'old' } } } }))
    expect(previousEnv(config)).toEqual({ LERNZEIT_TOKEN: 'old' })
    expect(JSON.parse(withServer(config, entry)).mcpServers.lernzeit.args).toEqual([PATH])
  })

  it('starts a config when there is none', () => {
    expect(parseDesktopConfig(undefined)).toEqual({})
    expect(previousEnv({})).toEqual({})
    expect(JSON.parse(withServer({}, entry))).toEqual({ mcpServers: { lernzeit: entry } })
  })

  it('refuses a config it cannot read, instead of overwriting it', () => {
    expect(() => parseDesktopConfig('{ "mcpServers": ')).toThrow('not valid JSON')
    expect(() => parseDesktopConfig('[]')).toThrow('not a JSON object')
    expect(() => parseDesktopConfig('{ "mcpServers": [] }')).toThrow('"mcpServers" that is not an object')
  })

  it('looks in the right folder on each system', () => {
    expect(desktopConfigPaths('darwin', {}, '/Users/me')[0].replaceAll('\\', '/')).toBe('/Users/me/Library/Application Support/Claude/claude_desktop_config.json')
    expect(desktopConfigPaths('linux', {}, '/home/me')[0].replaceAll('\\', '/')).toBe('/home/me/.config/Claude/claude_desktop_config.json')
    expect(desktopConfigPaths('win32', { APPDATA: 'C:/Users/me/AppData/Roaming', LOCALAPPDATA: 'C:/nowhere' }, 'C:/Users/me')[0].replaceAll('\\', '/')).toBe(
      'C:/Users/me/AppData/Roaming/Claude/claude_desktop_config.json',
    )
  })
})

describe('claudeCodeArgs', () => {
  it('passes the scope and each variable', () => {
    expect(claudeCodeArgs(serverEntry({ LERNZEIT_TOKEN: 'abc', LERNZEIT_PORT: '50000' }, PATH), 'user')).toEqual([
      'mcp', 'add', 'lernzeit', '--scope', 'user', '-e', 'LERNZEIT_TOKEN=abc', '-e', 'LERNZEIT_PORT=50000', '--', 'node', PATH,
    ])
  })
})
