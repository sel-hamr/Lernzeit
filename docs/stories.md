# Stories

Read short German stories with your decks. Every word that is in a deck is highlighted by how well you know it, nouns take their gender colour, and tapping any word shows its card or adds it to a deck.

## Where things live

| Part | File | Job |
|---|---|---|
| Word matching | [src/lib/reader.ts](../src/lib/reader.ts) | Splits a text into words, lists the forms each card stands for, finds the cards behind each word, says how well a card is known |
| Active time | [src/lib/activity.ts](../src/lib/activity.ts) | Counts reading time while the page is visible and someone scrolled, tapped or typed in the last two minutes |
| Data | [src/data/stories.ts](../src/data/stories.ts) | Save, delete, mark as read, starter stories |
| Starter stories | [src/db/starter/stories/](../src/db/starter/stories) | 103 stories by theme, loaded on demand |
| Pages | [src/features/stories/](../src/features/stories) | Stories list, reader, word panel, editor, Write with AI |
| Prompt | [src/lib/storyPrompt.ts](../src/lib/storyPrompt.ts) | Picks a deck's words and builds the prompt for Claude |
| AI | [src/bridge/actions.ts](../src/bridge/actions.ts), [mcp/src/tools.ts](../mcp/src/tools.ts) | The `create_story` tool and the `write_story` prompt |

Stories are a Dexie table (`stories`, schema version 2), included in backups. Backups made before stories still restore.

## How words are matched

Lernzeit has no German dictionary, so it matches on forms. Each card lists the forms it stands for:

| Card | Forms | Strength |
|---|---|---|
| Any | The German as written. `der / die / das` gives each article | listed |
| Noun | The plural from the card, the dative plural (*Kindern*), the genitive (*Hundes*), weak nouns (*Jungen*) | listed / built |
| Verb | Present tense endings, the past tense and participle from the card's verb forms, the past tense with its endings | built / listed |
| Verb, irregular | Only the forms in `IRREGULAR_PRESENT` (*bin, ist, kann, würde*), so *sein* never turns into *seit* | built |
| Verb, stem change | `STEM_CHANGE` (*liest, fährt*), also for verbs built on them (*vergisst, abfährt*) | built |
| Adjective | Declension, comparative and superlative endings, *dunkle* for *dunkel* | built |
| Article, possessive | Declension (*einen, unsere, diesem*) | built |
| Preposition | Contractions (*im, zum, beim*) | built |
| Pronoun | Object forms (*ihn, ihm, Ihnen*) | built |
| Two-word verb | The first word alone: *Wir gehen im Park spazieren* | built |

Then for each word in the text:

1. The longest phrase wins: *zu Hause* is one match, but never across punctuation.
2. Mid-sentence, a capital points to cards written with one (*das Essen*, *Sie*) and a small letter to the rest (*essen*, *sie*). At the start of a sentence both can be meant, and both are shown.
3. Forms listed on the card beat forms built from an ending: *Arbeit* is the noun, not the stem of *arbeiten*.

## How well a card is known

| Status | Rule | Highlight |
|---|---|---|
| New | Every review is still new | Yellow |
| Learning | Studied, but no review is three weeks out yet | Green |
| Known | A review is scheduled 21 days or more out (Anki calls this mature) | Thin underline |
| Not in your decks | No card has this form | None, tap to add |

A word with several cards takes the best status: knowing one meaning of a word is knowing the word.

The story's bar counts running words by status. The difficulty chip reads it: *Easy read* from 95% known or learning, *Good challenge* from 85%, *Study its words first* when 80% are at least in a deck, otherwise *Hard for now*.

## Write with AI

Claude Desktop or Claude Code writes the story and saves it through the AI connection ([mcp-bridge.md](mcp-bridge.md)). That connection cannot read your cards, so Lernzeit puts your deck's words into the prompt:

1. Pick a deck (or all), a level, a length and a theme. The level drives the prompt: what Short, Medium and Long mean (60 to 130 words at A1, 150 to 350 at B1, up to 1,000 at C2), the sentence length and grammar, how strictly to keep to my words, and how many new words may come in (3 at A1, 8 at B1). The prompt lists every word of the deck: first the words you know or are learning (learning first), then the new words in deck order. With 30 or more studied words, the story keeps to them and brings in only as many new words as the level allows; with fewer, a story cannot be built from them alone, so it uses the whole deck and the studied words as often as it can.
2. **Copy prompt**, paste it into Claude Desktop or Claude Code, and send it. **See the prompt** shows exactly what is sent.
3. The prompt ends by asking Claude to save the story with `create_story` (title, level, German text, English translation). The story gets the tag `ai`.
4. The dialog shows whether the AI connection is on. When the story arrives, step 3 shows its title and **Read it** opens it.

## Reading time

The reader saves active reading time as a study session, the way review time is saved: one session per visit that grows as you read, once it reaches a minute. A timer already running for the same topic counts the time, so then nothing is saved. **Settings → Focus timer → Count story reading as study time** turns it off.

## Known limits

- Separable verbs split in a sentence (*stand ... auf*) are not joined back, so *stand* alone does not count for *aufstehen*.
- Names (*Anna*, *Berlin*) are never in a deck, so they lower a story's share. The starter stories average 93% of their words in the starter decks.
- Feminine forms such as *Lehrerin* are not matched to *Lehrer*: they would take *der*'s colour while being *die* words.
- A word that is also a form of another card (*gefallen*: the verb, and the participle of *fallen*) shows both cards.
- Seeing a word in a story does not count as a review. FSRS schedules from real recall, and a passive look would push reviews later than they should be.
