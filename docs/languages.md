# German levels

Lernzeit teaches German, explained in English. There is nothing to choose: the app's words stay in English, and everything you learn is German.

It starts empty, with no pop-up: open it and add your own words. The first word makes a **German words** deck.

Ready-made content is optional. **Settings → Starter content → Add a level** installs a level of the German **pack**: decks of words and sentences, short stories, speaking questions and grammar topics, with a German topic for your study time (half an hour a day to start).

Everything in the pack ships with the app. Nothing is downloaded or generated when you pick a level.

| Level | Holds |
|---|---|
| A1 | 633 cards, 102 stories, 25 questions, 14 grammar topics |
| A2 | 36 cards, 1 story, 20 questions, 8 grammar topics |
| B1 | 5 grammar topics |

The pack includes **My Words**, the drawings on nine cards and the conjugation tables the grammar drills ask. The dialog shows the exact counts of the level you pick.

**Starter stories**, **Starter questions** and **Starter topics** add the items of the levels you have that are missing. Before you add a level, they add those of every level.

Data saved before packs keeps its old field names: a card's `german` is the word and its `english` the meaning. The first start after the update marks all three levels as installed on those installs.

## Pack format

The pack is the folder `src/languages/de/`.

| File | Holds |
|---|---|
| `info.ts` | `info`: name, voice tag, sample sentence, letter buttons, levels. Always loaded, so keep it small |
| `content.ts` | `content`: decks, cards, stories, questions and grammar topics. Loaded only when a level is installed, so the pack is its own chunk |

Every item has a `level`, and installing a level installs the items with that level. Ids never change: installing again skips the ids it has, and grammar scores are kept by exercise id.

Exercises use the same format as the grammar editor ([grammar.md](grammar.md)).

## Where things live

| Part | File |
|---|---|
| Pack types | [src/languages/types.ts](../src/languages/types.ts) |
| Loading the pack, picking levels | [src/languages/index.ts](../src/languages/index.ts) |
| Installing, the empty check, Starter buttons, updates for older installs | [src/data/languages.ts](../src/data/languages.ts) |
| Add a level | [src/features/settings/LevelDialog.tsx](../src/features/settings/LevelDialog.tsx) |
| Settings → Starter content | [src/features/settings/LevelGroup.tsx](../src/features/settings/LevelGroup.tsx) |
| Tests | [src/languages/languages.test.ts](../src/languages/languages.test.ts), [src/data/languages.test.ts](../src/data/languages.test.ts) |
