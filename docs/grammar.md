# Grammar

A grammar course inside Lernzeit, from A1 to B1. Each topic teaches the **rule**, shows **examples**, and practises it with **exercises that explain every answer**. A path tells you what to learn next, and a spaced **review** brings back what you got wrong until it stays. Topics that fit your cards also practise on **your own words**, and you can write your own topics, or let Claude write them.

## Where things live

| Part | File | Job |
|---|---|---|
| Topics and practice | [src/lib/grammar.ts](../src/lib/grammar.ts) | The text formats, the four kinds of exercise, practice and review rounds, progress, the Ask Claude message |
| Card questions | [src/lib/drills.ts](../src/lib/drills.ts) | Questions about your cards (gender, plural, verb forms); ordering by need and retries, shared with exercises |
| Conjugation tables | [src/lib/conjugation.ts](../src/lib/conjugation.ts) | Reads a verb card's conjugation; no grammar rules |
| Data | [src/data/grammar.ts](../src/data/grammar.ts), [src/data/drills.ts](../src/data/drills.ts) | Save and delete topics, install and update the starter topics, scores of exercises and cards |
| Starter topics | [src/languages/de/grammar.ts](../src/languages/de/grammar.ts) | The German pack's 27 topics and their 384 exercises, loaded on demand. Other packs have theirs in `src/languages/<code>/grammar.ts` ([languages.md](languages.md)) |
| Starter verb tables | [src/languages/de/words.json](../src/languages/de/words.json), [src/data/languages.ts](../src/data/languages.ts) | The conjugation of all 139 starter verbs, and the one-time step that adds it to starter verbs saved before |
| Pages | [src/features/grammar/](../src/features/grammar) | The Grammar page, a topic, practice and review (one shared round), the topic editor |
| AI | [src/bridge/actions.ts](../src/bridge/actions.ts), [mcp/src/tools.ts](../mcp/src/tools.ts) | `list_grammar_topics`, `add_grammar` and the `make_grammar` prompt |

## The starter topics

| Section | Topics |
|---|---|
| Nouns and articles | Der, die, das · Plural · Der, ein, kein |
| Cases | Nominativ und Akkusativ · Dativ · Genitiv |
| Pronouns | Personalpronomen · Possessivartikel |
| Prepositions | Präpositionen mit Akkusativ · Präpositionen mit Dativ · Wechselpräpositionen |
| Verbs | Präsens · Modalverben · Trennbare Verben · Perfekt · Präteritum · Reflexive Verben · Imperativ · Konjunktiv II · Passiv |
| Sentences | Verb an Position 2 · Fragen · Nicht und kein · Nebensätze: weil, dass, wenn · Relativsätze |
| Adjectives | Adjektivendungen · Komparativ und Superlativ |

Each has a rule with tables, 3 or 4 examples with their English, and 12 to 16 exercises, 384 in all: 176 with choices, 74 typed gaps, 63 mistakes to find, 29 sentences to put in order and 42 to write. Every exercise has its English (except rewrites) and a **why**.

### Installing and updating

- The starter topics are installed the first time the app opens with this feature, for new and existing users alike.
- When the app ships a new version of them (`STARTER_GRAMMAR_VERSION` in [src/data/grammar.ts](../src/data/grammar.ts)), every starter topic **you have not edited** is updated once. Exercise ids stay with their exercise, so your scores are kept; an exercise that was removed takes its score with it.
- A topic you edited is never changed. A topic you deleted stays deleted; **Starter topics** on the Grammar page adds back any that are missing.

## The Grammar page

- **Continue** shows the next topic on your path with its progress: the one you started and have not mastered, or else the first new one. **Practise** starts a round; for a new topic, **Start: read the rule** opens it first.
- **Review** shows how many exercises are due, and when the next one is if none are. **Start review** practises them.
- **Your path** lists the topics by level (A1, A2, B1, then topics without a level); **By section** lists them by section. The choice is remembered in this browser.
- Each topic has a ring that fills with how many of its exercises you know, a tick when it is mastered, and how many are **to work on**.

A topic is **mastered** when you know 80% of its exercises. You know an exercise when your last answer was right and your mistakes on it are made up for (its score is back to 0).

## A topic

- **Progress:** a bar and *3 of 15 exercises known · 2 to work on*.
- **The rule**, with its tables. On a phone a wide table scrolls on its own.
- **Examples**, each with a speaker button.
- **From your cards**, for a topic linked to a card drill: your words that fit it (your nouns in their gender colours, your plurals, your verbs with that tense's forms), or what to add to your cards when none fit yet.
- **Exercises:** **Show all** lists every exercise solved, with its kind, its English and its why, to read before or after practising.
- **Edit** and **Practise**.

## Practice

A round has up to 12 of the topic's exercises, the ones you get wrong first, then ones not done yet (in random order), then the rest, practised longest ago first. A topic linked to a card drill adds up to 5 questions about your words, spread among the exercises. A topic with no exercises of its own asks only about your cards, up to 15.

| Kind | You see | You answer |
|---|---|---|
| Fill the gap, with choices | *Ich helfe ___ Mann.* | Press a button or <kbd>1</kbd>–<kbd>4</kbd>. Articles always come as der, die, das in their colours |
| Fill the gap, typed | *Du ___ zu schnell. (fahren)* | Type the missing word |
| Find the mistake | *Das Buch gehört die Lehrerin.* as words | Tap the wrong word |
| Put the words in order | The words, shuffled, and the English | Tap them in order. **Take back** (or <kbd>Backspace</kbd>) and **Start over** undo |
| Write the sentence | *Ich esse Pizza. (Perfekt)* | Type the whole sentence |
| Your noun's gender | Its picture and *___ Hund* | <kbd>1</kbd> der, <kbd>2</kbd> die, <kbd>3</kbd> das |
| Your noun's plural | *der Hund* | Type it; *die* is optional |
| Your verb | *du ___ (fahren)* | Type the form; the pronoun is optional |

After each answer:

- The right sentence, with the answer in green, and its audio.
- **Right**, **Almost** (a small slip, see below) or **Not quite**, with the letters you got wrong marked, the order you built, or the word you tapped.
- **Why**: the exercise's explanation, such as *helfen takes the dative: dem Mann.* A verb question shows that tense's six forms from the card instead.
- **Ask Claude why** (or **Ask Claude for more examples** after a right answer) opens a new Claude chat with the topic, the exercise, your answer, the right one and the why, asking for a simple explanation, two more examples and three sentences to try.

A wrong answer comes back three questions later in the same round, at most twice. **Don't know** shows the answer and counts as wrong. At the end: how many you got right the first time, how far the topic moved (*Personalpronomen 0% → 53% known*, and *Mastered* when it gets there), and the ones to work on with their answers. **Practise again** starts a new round.

<kbd>Enter</kbd> checks a typed answer or the word order, then goes on. <kbd>Esc</kbd> ends the round.

### Small slips

Typed answers are checked like typing mode, with one difference:

| You type | Answer | Result |
|---|---|---|
| *faehrst* | *fährst* | Right, with a note: write umlauts as ä, ö, ü |
| *Um* | *um* | Right, with a note: check the capital letters |
| *fahrst* | *fährst* | **Wrong**: watch the umlauts |

Typing mode accepts a missing umlaut as a slip. Grammar does not, because the umlaut is often the point: *Äpfel*, *fährst*.

Word order is compared without capitals or punctuation, so any right order counts. When another right order starts with a different word, the first word's tile is shown in lowercase, so its capital does not give the start away; commas are left off the tiles because they move with the order.

## Review

Each exercise remembers when it is due again:

| Answer | Comes back |
|---|---|
| Wrong | 10 minutes later |
| Right, the 1st time in a row | 1 day later |
| 2nd, 3rd, 4th, 5th time in a row | 3, 7, 16, 35 days later |
| 6th time and after | 75 days later |

**Review** practises up to 20 due exercises from every topic, most overdue first, in mixed order, each labelled with its topic. It works like practice, and only asks exercises you have practised before. Card questions are not reviewed here; your cards have their own schedule in Flashcards.

## Writing a topic

**New topic** or **Edit** opens the editor. Every field is plain text:

| Field | Format |
|---|---|
| Title, English, Summary | One line each |
| Section | Pick one or type a new one. Empty means *My topics* |
| Level | A1 to C2, or none. The path orders topics by it |
| Rule | A blank line starts a new paragraph. `- ` lines make a list, `\| a \| b \|` lines a table (a `\|---\|---\|` line under the first row marks the header), `### ` a heading, `**bold**` and `*italic*` |
| Examples | One per line: `German = English`. The English is optional |
| Exercises | One per line: `exercise = English // why`. English and why are optional |
| Also practise with my cards | None, der / die / das, plurals, or your verbs (every tense, or one) |

The four kinds of exercise:

| Write | Kind |
|---|---|
| `Ich helfe {{dem\|den\|der}} Mann.` | Choices; the first is right, and they are shuffled |
| `Du {{fährst}} zu schnell.` | Typed gap. `{{fandest/fandst}}` takes either spelling |
| `Ich helfe {{den>dem}} Mann.` | Find the mistake: shows *den*, the fix is *dem*. Mark one whole word |
| `~ Ich gebe dem Mann das Buch.` | Word order. `~ A / B` adds another right order with the same words |
| `Ich esse Pizza. (Perfekt) => Ich habe Pizza gegessen.` | Write the sentence. `=> A / B` takes either |

A line the app cannot use stops the save and says which line and why. An exercise whose text you do not change keeps its score; removing an exercise removes its score.

## Asking Claude

Two ways, both through Claude:

- **Ask Claude why**, after any exercise, opens claude.ai in a new tab with the question filled in. Nothing is sent until you send it there.
- **The AI connection** ([docs/mcp-bridge.md](mcp-bridge.md)) lets Claude Desktop or Claude Code write grammar into the app. The `make_grammar` prompt asks for exercises on a topic at your level; Claude calls `list_grammar_topics`, then `add_grammar` to add them to the topic that fits, or to start a new one with a rule. Exercises the app cannot use are refused before anything is saved, and ones a topic has already are skipped. Claude sees topic names only, never your answers or scores.

## Your cards in grammar

Card questions come from the card's own fields, never from rules:

| Drill | Uses |
|---|---|
| der / die / das | `gender` of a word card |
| Plural | `gender` and `plural` (`die Hunde` or `Hunde`) |
| Verbs | `conjugation`: each tense as six forms, for *ich, du, er/sie/es, wir, ihr, sie* |

```json
"conjugation": {
  "present": "fahre, fährst, fährt, fahren, fahrt, fahren",
  "past": "fuhr, fuhrst, fuhr, fuhren, fuhrt, fuhren",
  "perfect": "bin gefahren, bist gefahren, ist gefahren, sind gefahren, seid gefahren, sind gefahren"
}
```

- `–` marks a form that is not asked (*regnen*: `–, –, regnet, –, –, –`, shown with *es*), and `/` gives two right spellings.
- A tense is asked only when its line has exactly six forms. A verb without a conjugation is not asked.
- All 139 starter verbs have one. For your own verbs, write it in the card editor (**Conjugation**: Present, Past, Perfect), a card pack, a CSV (`present`, `past`, `perfect` columns), or let the AI connection fill it (`create_cards` takes `conjugation`).
- Starter verbs saved before conjugations existed get the pack's table once, unless you changed their verb forms or gave them a table yourself.

Card scores are kept per card and drill, and shared between topics: a noun you got wrong in *Der, die, das* comes first in any topic that asks about genders. Grammar never changes the flashcard schedule.

## Data

| Table | Fields | Index |
|---|---|---|
| `grammarTopics` | `id`, `title`, `english`, `group`, `level`, `summary`, `rule`, `examples` (`de`, `en`), `exercises` (`id`, `text`, `en`, `why`), `drill` (`kind`, `tense`), `createdAt`, `updatedAt` | `id, group, createdAt` |
| `exerciseStats` | `id` (the exercise id), `topicId`, `right`, `wrong`, `score`, `streak`, `lastAt`, `due` | `id, topicId` |
| `drillStats` | `id` (`cardId:drill`), `cardId`, `drill`, `right`, `wrong`, `score`, `lastAt` | `id, cardId, drill` |

- `score` rises by 2 for a wrong answer and falls by 1 for a right one, never below 0. `streak` counts right answers in a row and sets `due`.
- Deleting a topic deletes its exercise scores. Deleting a card or a deck deletes its drill scores.
- All three tables are in backups. Backups made before grammar restore without them.

Practice and review time count toward the first deck's topic, for example German, like question practice does, unless a timer is already running for it. Each is saved as a session with a note such as *Grammar: Dativ* or *Grammar: Review*. **Settings → Count grammar practice as study time** turns it off.

## Later

- Exercises with more than one gap.
- Listening exercises: hear a sentence, then answer.
- A placement check that marks the topics you already know.

## Why this way

German-only apps such as [KasusKnacker](https://apps.apple.com/app/id6757100358), [German Case Practice](https://apps.apple.com/app/id1247446191) and Der Die Das drill gender, cases and verbs, because these are the hardest part of German for most learners. A chat with an AI explains well but forgets what you got wrong. Lernzeit teaches the rule, explains every answer, remembers your mistakes and brings them back on a schedule, and practises on the words you already study; Claude is one tap away when you want more.

## Known limits

- One gap per exercise.
- Your own verbs need their conjugation written before they are asked.
- The starter content stops at B1.
- Ask Claude opens claude.ai; it needs a Claude account and leaves the app.
