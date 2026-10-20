# Languages

Lernzeit starts empty. On the first visit, and whenever there is nothing to learn, **Welcome** asks for three things: the language you want to learn, your own language, and your level. It then installs that level of the language's **pack**: decks of words and sentences, short stories, speaking questions and grammar topics, with a topic named after the language for your study time (half an hour a day to start).

Everything in a pack ships with the app. Nothing is downloaded or generated when you pick it.

## Ready-made packs

| Language | Explained in | Levels | Per level |
|---|---|---|---|
| German | English | A1, A2, B1 | A1: 633 cards, 102 stories, 25 questions, 14 grammar topics. A2: 36 cards, 1 story, 20 questions, 8 grammar topics. B1: 5 grammar topics |
| French | English | A1, A2 | A1: 95 cards, 3 stories, 10 questions, 4 grammar topics. A2: 50 cards, 2 stories, 6 questions, 3 grammar topics |
| Spanish | English | A1, A2 | the same as French |
| Arabic (Modern Standard, without vowel marks) | English | A1, A2 | the same as French |
| English | Arabic, French, Spanish, German | A1, A2 | A1: 95 cards, 3 stories, 10 questions, 3 grammar topics. A2: 50 cards, 2 stories, 6 questions, 3 grammar topics |

The German pack is the data Lernzeit always had, including **My Words**, the drawings on nine cards and the conjugation tables the grammar drills ask. Welcome shows the exact counts of the level you pick.

## One language at a time

The app labels, speaks and checks one language: "English → French" on cards, the French voice, French articles in typing mode. So a second language needs a fresh start: export a backup, then **Settings → Your data → Delete all data**, and Welcome asks again.

**Settings → Language** shows what you learn and adds the other levels of the same pack. **Starter stories**, **Starter questions** and **Starter topics** add back deleted items of the levels you have.

## What changes with the language

| Part | German | Other languages |
|---|---|---|
| Labels | German, English | The language's name and yours: "Image → Spanish", "Arabic voice" |
| Voice | Browser voice or the offline Thorsten voice | The browser's voices for the language (`speech` in the pack). Thorsten speaks German only |
| Nouns | Article in the gender field, coloured der, die, das | Article written with the noun: le chien, el perro |
| Card editor | Gender, plural, verb forms, conjugation | Plural and verb forms; no gender or conjugation |
| Grammar drills on your cards | Gender, plural, verb tables | Not offered: they need German genders and tables |
| Typing mode | ue for ü, a missing umlaut or article is a slip | A missing accent or article is a slip; a wrong article (le for la) is wrong |
| Reading | German endings found (Hunde, ging) | Plural -s, nouns without their written article, Arabic words with ال، و، ب، ل، ف written onto them |
| Letter buttons | ä ö ü ß | French é è ê à â ç ô î û ù ë œ, Spanish á é í ó ú ñ ü ¿ ¡ |
| Right to left | | Arabic text runs right to left, in your language too when it is Arabic |

The app's own words (buttons, headings, help) stay in English.

Data saved before packs keeps its old field names: a card's `german` is the word in the language you learn and its `english` the meaning in your own. Installs from before packs are German from English, and the first start after the update marks all three German levels as installed.

## Pack format

A pack is a folder in `src/languages/` named after the language code. The app finds it by its files; nothing else needs registering.

| File | Holds |
|---|---|
| `info.ts` | `info`: name, name in the language itself, voice tag, sample sentence, letter buttons, right to left, the native languages it is written in, its levels. Always loaded, so keep it small |
| `content.ts` | `content`: decks, cards, stories, questions and grammar topics. Loaded only when a level is installed, so each pack is its own chunk |
| `words.ts`, `texts.ts`, `grammar.ts` | The content as short rows, read through the helpers in `src/languages/build.ts` |

Every item has a `level`, and installing a level installs the items with that level. Ids carry the language code (`fr-0025`, `fr-story-01`, `fr-grammar-03-02`) and never change: installing again skips the ids it has, and grammar scores are kept by exercise id.

### Meanings in several native languages

Anything you read in your own language (a meaning, a translation, a rule, a why) is a `Text`: a plain string is English, and a map gives one per language, such as `{ ar: 'كلب', fr: 'le chien', es: 'el perro', de: 'der Hund' }`. A pack lists in `natives` the languages every one of its texts is written in, and Welcome offers only those. The English pack is the example of a map-based pack (`m(ar, fr, es, de)` in `src/languages/en/words.ts`).

### Grammar exercises

Exercises use the same format as the grammar editor ([grammar.md](grammar.md)): `{{right|wrong|wrong}}` to pick, `{{typed}}` to type, `{{wrong>right}}` to find the mistake, `~ sentence` to put in order and `prompt => answer` to write. Spanish ¿ ¡, French « » and Arabic ، ؟ ؛ count as punctuation.

## Adding a language

```bash
npm run lang:add -- it --speech it-IT
```

This creates `src/languages/it/` with empty lists and a commented example row in each file. Options: `--name` and `--endonym` (taken from the code when known), `--speech` (the voice tag, default the code), `--native en,fr` (default `en`), `--levels A1,A2` (default `A1`) and `--rtl`. With the [`lz` command](../README.md#the-lz-command) it is `lz lang:add it --speech it-IT`.

Then fill in the words, sentences, stories, questions and grammar, and the sample sentence in `info.ts`, and run `npm test`. [src/languages/languages.test.ts](../src/languages/languages.test.ts) checks every pack: ids unique across all packs, every level has something, every card in a deck, every text in each native language it promises, translations that line up paragraph by paragraph, rules and exercises that parse. A new pack fails these until it is complete, and the messages say what is missing.

## Where things live

| Part | File |
|---|---|
| Pack types | [src/languages/types.ts](../src/languages/types.ts) |
| Finding packs, names, localizing to a native language | [src/languages/index.ts](../src/languages/index.ts) |
| Row helpers for pack files | [src/languages/build.ts](../src/languages/build.ts) |
| Installing, the empty check, Starter buttons, updates for older installs | [src/data/languages.ts](../src/data/languages.ts) |
| Welcome and Add a level | [src/features/languages/](../src/features/languages) |
| Settings → Language | [src/features/settings/LanguageGroup.tsx](../src/features/settings/LanguageGroup.tsx) |
| The script | [scripts/add-language.ts](../scripts/add-language.ts) |
| Tests | [src/languages/languages.test.ts](../src/languages/languages.test.ts), [src/data/languages.test.ts](../src/data/languages.test.ts), [scripts/add-language.test.ts](../scripts/add-language.test.ts) |

The AI connection (MCP server) still describes cards, stories and questions as German in its instructions to Claude. Its fields are plain text, so it saves other languages too, but Claude has to be told which language you learn.
