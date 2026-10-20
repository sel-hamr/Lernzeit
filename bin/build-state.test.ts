import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { needsBuild, newestChange } from './build-state.ts'

let root: string

/** Writes a file and sets its modification time, in seconds since 1970. */
function file(path: string, seconds: number) {
  const full = join(root, path)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, '')
  utimesSync(full, seconds, seconds)
}

function folder(path: string, seconds: number) {
  utimesSync(join(root, path), seconds, seconds)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lz-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('newestChange', () => {
  it('is 0 for a missing path', () => {
    expect(newestChange(join(root, 'nothing'))).toBe(0)
  })

  it('finds the newest file deep in a folder', () => {
    file('src/a.ts', 1000)
    file('src/lib/b.ts', 3000)
    file('src/lib/deeper/c.ts', 2000)
    folder('src/lib/deeper', 100)
    folder('src/lib', 100)
    folder('src', 100)
    expect(newestChange(join(root, 'src'))).toBe(3_000_000)
  })

  it('counts a folder whose files were added or deleted', () => {
    file('src/a.ts', 1000)
    folder('src', 5000)
    expect(newestChange(join(root, 'src'))).toBe(5_000_000)
  })
})

describe('needsBuild', () => {
  beforeEach(() => {
    file('src/main.tsx', 1000)
    folder('src', 1000)
    file('index.html', 1000)
  })

  it('builds when there is no build yet', () => {
    expect(needsBuild(root)).toBe(true)
  })

  it('does not build when nothing changed since the build', () => {
    file('dist/index.html', 2000)
    expect(needsBuild(root)).toBe(false)
  })

  it('builds when a source file changed after the build', () => {
    file('dist/index.html', 2000)
    file('src/main.tsx', 3000)
    folder('src', 1000)
    expect(needsBuild(root)).toBe(true)
  })

  it('builds when the config or the dependencies changed', () => {
    file('dist/index.html', 2000)
    file('package-lock.json', 3000)
    expect(needsBuild(root)).toBe(true)
  })

  it('ignores files a build does not read', () => {
    file('dist/index.html', 2000)
    file('README.md', 3000)
    file('mcp/src/index.ts', 3000)
    expect(needsBuild(root)).toBe(false)
  })
})
