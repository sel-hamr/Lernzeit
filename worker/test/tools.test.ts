import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import { ChangeError } from '../src/changes.ts'
import { explain, runTool } from '../src/mcp/tools.ts'

describe('a failed tool call', () => {
  it('asks the AI to split a write too large for D1', () => {
    expect(explain(new ChangeError('That push is too large to store at once.', 413))).toMatchObject({ code: 'too_large' })
  })

  it('treats any other refused write as Lernzeit’s own fault, not the AI’s', () => {
    expect(explain(new ChangeError('Change 0 needs data unless it is deleted.'))).toBeUndefined()
  })

  it('says so in words that fit a read as well as a write, and logs the cause', async () => {
    const failing = { prepare: (sql: string) => env.DB.prepare(sql), batch: () => Promise.reject(new Error('D1 is down')) } as unknown as D1Database
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(await runTool(failing, 'owner', 'list_decks', {})).toEqual({
        content: [{ type: 'text', text: 'Lernzeit could not do that. Try again. [internal]' }],
        isError: true,
      })
      expect(logged).toHaveBeenCalledWith('Lernzeit tool list_decks failed', expect.any(Error))
    } finally {
      logged.mockRestore()
    }
  })
})
