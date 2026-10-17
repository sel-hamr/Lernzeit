# Thorsten voice

An offline German voice for every speaker button. It is Piper's `de_DE-thorsten-medium` model, run in the browser with no server, key or account. The browser's own voices stay as the default and as the fallback.

## Where things live

| Part | File | Job |
|---|---|---|
| Speaking | [src/data/voice.ts](../src/data/voice.ts) | `speak`, `stopSpeaking`, `prepareSpeech`, `warmUpVoice`, `voiceOptions`. Picks Thorsten or the browser voice, plays clips at the chosen speed |
| Saved clips | [src/data/clips.ts](../src/data/clips.ts) | The `clips` table (schema version 4): one WAV per voice and text, up to 100 MB, least recently used dropped first |
| Worker client | [src/lib/thorsten.ts](../src/lib/thorsten.ts) | Starts the worker; download, status, remove, warm up, make a clip |
| Worker | [src/lib/thorsten.worker.ts](../src/lib/thorsten.worker.ts) | Runs piper-tts-web off the main thread, one job at a time |
| Browser voice | [src/lib/speech.ts](../src/lib/speech.ts) | `speechSynthesis`, German voices |
| Settings | [src/features/settings/VoiceField.tsx](../src/features/settings/VoiceField.tsx) | One *German voice* choice: Thorsten or a browser voice. Download with progress, remove |

## How it works

1. **Download.** Picking *Thorsten* under Settings → *German voice* downloads the model (63 MB) from Hugging Face once. piper-tts-web keeps it in the origin private file system. The model is loaded right away to check it (a broken download is removed), and the voice is turned on.
2. **Runtime files.** The ONNX runtime (14 MB WASM) and the German phonemizer (0.6 MB WASM, 18 MB espeak data) are bundled by Vite and served from `/assets`, never from a CDN. The service worker caches them on first use (`voice-runtime`), not at install, so people who never turn the voice on don't download them.
3. **Speaking.** `speak` looks for a saved clip of the text. If there is none, the worker makes one and it is saved. Speed is the audio element's `playbackRate` with `preservesPitch`, so one clip serves every speed. Each `speak` or `stopSpeaking` bumps a counter, so a clip that arrives late never plays over newer audio.
4. **Ahead of time.** Review prepares the current and the next card's audio while the card is on screen. The reader and question practice load the model when they open.
5. **Fallback.** Until the model is downloaded, or if the worker fails, the browser voice speaks.

Clips are not in backups: they can always be made again. Reset all data deletes them. Removing the voice deletes the model and the clips and switches back to the browser voice.

## Measured

Chromium on Windows, single-threaded WASM (the page is not cross-origin isolated):

| Step | Time |
|---|---|
| Download the model | about 10 s |
| Load it into memory (first clip of a session) | about 2 to 3 s |
| A word (*die Brücke*, 0.65 s of audio) | 0.2 s |
| A sentence (1.4 s of audio) | 0.4 s |
| A story paragraph (192 characters, 9.7 s of audio) | 2.2 s |
| A saved clip, from reveal to play | under 20 ms |

## Why Thorsten

Checked on 2026-10-16 against the providers' own pages:

| Option | Free | Notes |
|---|---|---|
| **Piper, Thorsten** | Unlimited, offline | Voice data CC0 ([model card](https://huggingface.co/rhasspy/piper-voices/blob/main/de/de_DE/thorsten/medium/MODEL_CARD)). The library and its mirror of the voices serve the same file as the official Piper repo (same SHA-256) |
| Google Cloud TTS | 1M characters a month (Chirp 3 HD), 4M (Standard, WaveNet) | Billing with a card must be enabled ([pricing](https://cloud.google.com/text-to-speech/pricing)) |
| Azure AI Speech | 0.5M characters a month (neural) | Needs an Azure account ([pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/)) |
| Amazon Polly | 1M neural characters a month for 12 months only | ([pricing](https://aws.amazon.com/polly/pricing/)) |
| ElevenLabs | 10k credits a month | Too little for daily review ([pricing](https://elevenlabs.io/pricing)) |
| Kokoro | Offline | No German ([voices](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md)) |
| dict.cc recordings | Human recordings of single words | No API, and its FAQ forbids automated reading of the site ([FAQ](https://www.dict.cc/?s=about%3Afaq)). Usable only with the owner's permission, and only for words |

## Limits

- **First clip of a session** waits for the model to load (2 to 3 s), unless the page warmed it up.
- **Single-threaded.** Multi-threaded WASM needs cross-origin isolation headers, which the app doesn't send.
- **Pronunciation.** The model was fine-tuned from an English voice; rare words can come out wrong. The browser voice is one switch away.
- **piper-tts-web** hard-codes its model host (`diffusionstudio/piper-voices` on Hugging Face). The worker passes its own runtime file paths, so only the model comes from there.

## Credits

Voice by Thorsten Müller, [Thorsten-Voice](https://github.com/thorstenMueller/Thorsten-Voice) (CC0). Engine: [Piper](https://github.com/rhasspy/piper), run with [@mintplex-labs/piper-tts-web](https://www.npmjs.com/package/@mintplex-labs/piper-tts-web) (MIT) and [onnxruntime-web](https://www.npmjs.com/package/onnxruntime-web) (MIT).
