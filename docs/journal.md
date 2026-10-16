# Journal

> Status: planned. This page describes the feature before it is built.

Write a few German sentences every day. Claude corrects them, and your own mistakes become flashcards.

## A day

1. Open **Journal** and write 3 to 5 sentences about your day.
2. Press **Get correction**. The app builds a prompt with your text and copies it.
3. Paste it into Claude Desktop or Claude Code.
4. Claude sends the corrected text back to Lernzeit through the [AI connection](mcp-bridge.md).
5. You see your text and the corrected text side by side, with each change marked.
6. Tap a mistake to turn it into a card.

One entry per day. You can edit today's entry until you ask for a correction.

## After the correction

```
┌──────────────────────────────────────┐
│  15 Oct                              │
│                                      │
│  You:       Ich habe nach Hause      │
│             gegangen.                │
│  Corrected: Ich bin nach Hause       │
│             gegangen.                │
│                                      │
│  ✎ "gehen" takes "sein" in the       │
│     perfect tense.   [+ Make card]   │
└──────────────────────────────────────┘
```

- Changed words are marked: removed in red, added in green, the same as in Questions.
- Each mistake has a short note in English that says why.
- **Make card** makes a sentence card: the corrected sentence in German, with the word that was wrong as the cloze (*Ich {{bin}} nach Hause gegangen.*). It goes to the deck you pick, tagged `journal`.

## The prompt

The prompt has:

- your text
- your level (A1 to C2, from Settings)
- a request: correct the mistakes, keep my meaning, explain each change in simple English, and save it with `save_correction`

The prompt only has the text you wrote that day. Nothing else is sent.

## AI

A new tool on the AI connection:

| Tool | What it does |
|---|---|
| `save_correction` | Saves the corrected text and the list of changes to an entry |

Like the other tools, it can only add. Claude cannot read your journal: it only sees what you paste.

## Data

One new table:

| Table | Fields | Index |
|---|---|---|
| `journal` | `id`, `day`, `text`, `corrected`, `changes` (from, to, note), `level`, `createdAt`, `updatedAt` | `id, day` |

- The table is in backups.
- Writing time counts toward the German topic.

## Why this way

[Busuu](https://www.busuu.com/) is known for corrections: you write a short text and people who speak the language correct it. The journal does the same with Claude, every day, and adds the step most apps skip: your mistakes become cards you review.

## Known limits

- You need an AI app with the AI connection set up. Without it, you can still write and read your entries.
- Claude can be wrong. The notes help you check the changes.
