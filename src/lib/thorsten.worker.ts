/**
 * Runs the offline Thorsten voice (Piper) off the main thread, so making a
 * long story paragraph never freezes the page. The voice model is kept in the
 * origin private file system by piper-tts-web; the runtime files are served by
 * the app itself, so nothing comes from a CDN.
 */
import { download, remove, stored, TtsSession } from '@mintplex-labs/piper-tts-web'
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import piperWasm from '@diffusionstudio/piper-wasm/build/piper_phonemize.wasm?url'
import piperData from '@diffusionstudio/piper-wasm/build/piper_phonemize.data?url'
import type { ThorstenReply, ThorstenRequest } from './thorsten'

const scope = self as unknown as Worker

let session: Promise<TtsSession> | null = null
// One job at a time: the session runs a single model.
let queue: Promise<unknown> = Promise.resolve()

function getSession(voiceId: string): Promise<TtsSession> {
  session ??= TtsSession.create({
    voiceId,
    wasmPaths: {
      // onnxruntime-web also takes { wasm } instead of a folder, which keeps Vite's hashed file name.
      onnxWasm: { wasm: ortWasm } as unknown as string,
      piperWasm,
      piperData,
    },
  }).catch((error: unknown) => {
    session = null
    throw error
  })
  return session
}

async function handle(request: ThorstenRequest): Promise<Omit<ThorstenReply, 'id'>> {
  switch (request.type) {
    case 'status':
      return { stored: (await stored()).includes(request.voiceId) }
    case 'download':
      await download(request.voiceId, (p) => scope.postMessage({ id: request.id, progress: { loaded: p.loaded, total: p.total } } satisfies ThorstenReply))
      // download() resolves before its file write ends; loading the model sooner would fetch it again.
      for (let i = 0; i < 50 && !(await stored()).includes(request.voiceId); i++) await new Promise((r) => setTimeout(r, 200))
      return {}
    case 'remove':
      session = null
      TtsSession._instance = null
      await remove(request.voiceId)
      return {}
    case 'warm':
      await getSession(request.voiceId)
      return {}
    case 'speak':
      return { wav: await (await getSession(request.voiceId)).predict(request.text) }
  }
}

scope.onmessage = (event: MessageEvent<ThorstenRequest>) => {
  const request = event.data
  queue = queue.then(async () => {
    try {
      scope.postMessage({ id: request.id, ...(await handle(request)) } satisfies ThorstenReply)
    } catch (error) {
      scope.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) } satisfies ThorstenReply)
    }
  })
}
