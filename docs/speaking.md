# Speaking

> Status: planned. This page describes the feature before it is built.

Speak German out loud. Everything else in Lernzeit is reading, listening or typing; this adds speaking.

There are two parts: **shadowing** in Stories, and **say the answer** on cards and questions.

## Shadowing in Stories

Shadowing means you repeat a sentence right after you hear it, copying the speed and the melody.

1. Press **Shadow** in a story.
2. The app reads one sentence.
3. It stops and waits.
4. You say the sentence out loud.
5. Press **Next** (or <kbd>Space</kbd>), or let it go on by itself after a pause.

```
┌──────────────────────────────────────┐
│  Shadow             sentence 3 / 12  │
│                                      │
│  Der Hund spielt im Garten.          │
│                                      │
│  [↺ Again]  [🎤 Check me]  [Next →]  │
│  Speed: 0.6×  0.8×  1×               │
└──────────────────────────────────────┘
```

- **Again** plays the sentence again.
- **Check me** listens to you and shows what it heard (see below).
- Speed uses the same buttons as listening mode.
- Pause length: the time the sentence took, plus a little.

The sentence is split at `.`, `!` and `?`, and it is read with the German voice you chose in Settings.

## Say the answer

On flashcards and questions, a mic button sits next to the input box.

1. You see the card, for example *the dog*.
2. Press the mic and say *der Hund*.
3. The app writes what it heard into the box.
4. It is checked like a typed answer: small slips are accepted, wrong words show in red.

You can still type after speaking, to fix what the app heard wrong.

## How it hears you

The browser turns your voice into text with the Web Speech API, set to German (`de-DE`). The app compares that text with the right answer using the typing-mode check ([src/lib/answer.ts](../src/lib/answer.ts)).

## Settings

| Setting | Default |
|---|---|
| Show the mic button | On when the browser supports it |
| Shadowing goes on by itself | Off |

## Known limits

- **Chrome and Edge only.** Firefox and Safari do not support it well. On those browsers the mic button is hidden.
- **Needs internet.** The browser sends your voice to Google or Microsoft to turn it into text. Speaking does not work offline.
- It checks the **words**, not how good your accent is.
- Short sentences work best. Very short words (*ja*, *im*) are sometimes heard wrong.

## Why this way

[Pimsleur](https://en.wikipedia.org/wiki/Pimsleur_Language_Programs) has you answer out loud after a pause. [Language Reactor](https://jalt-publications.org/articles/28605-enhancing-functionality-youtube-and-netflix-language-reactor) pauses a video after each line so you can shadow it. Lernzeit does both with your own stories and cards, and adds a check of what you said.
