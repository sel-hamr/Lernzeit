import { describe, expect, it, vi } from 'vitest'
import { fetchWithoutReferrer } from './thorsten'

describe('fetchWithoutReferrer', () => {
  it('sends no referrer to Hugging Face, which answers 404 to pages on workers.dev', async () => {
    const base = vi.fn(async () => new Response('ok'))
    const url = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx'
    await fetchWithoutReferrer(base)(url, { method: 'GET' })
    expect(base).toHaveBeenCalledWith(url, { method: 'GET', referrerPolicy: 'no-referrer' })
  })

  it('leaves other requests as they are', async () => {
    const base = vi.fn(async () => new Response('ok'))
    await fetchWithoutReferrer(base)('/assets/piper_phonemize.data')
    expect(base).toHaveBeenCalledWith('/assets/piper_phonemize.data', undefined)
  })
})
