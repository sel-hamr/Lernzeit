# Grammar drills

> Status: planned. This page describes the feature before it is built.

Short quizzes made from **your own cards**. You add nothing new: your cards already have the gender, the plural and the verb forms. A round has 10 to 20 questions, and mistakes come back more often.

## The drills

| Drill | Question | You answer | Uses |
|---|---|---|---|
| **der / die / das** | ___ Hund | Press **der**, **die** or **das** | `gender` |
| **Plural** | der Hund | Type *die Hunde* | `plural` |
| **Verbs** | ich ___ (gehen) | Type *gehe* | `verbForms` |

A card is only used in a drill when it has the field for it. A noun with no plural is left out of the plural drill.

### der / die / das

- Three big buttons, coloured like the cards: **der** blue, **die** red, **das** green.
- Keys <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd> press them.
- After you answer, the word shows with its article, its picture and the audio.

### Plural

- You type the plural. *die* is optional.
- Small slips are accepted, the way typing mode accepts them: *ue* for *ü*, lowercase. Wrong letters show in red.

### Verbs

- The app picks a person (*ich, du, er/sie/es, wir, ihr, sie*) and a tense the card has: present, past, perfect.
- You type the verb form.
- The forms come from the card's verb forms, the same way the Stories reader finds them ([src/lib/reader.ts](../src/lib/reader.ts)).

## A round

```
┌──────────────────────────────────────┐
│  der / die / das          4 / 15     │
│                                      │
│              🐕                       │
│            ___ Hund                  │
│                                      │
│    [ der ]   [ die ]   [ das ]       │
└──────────────────────────────────────┘
```

1. Pick a drill and a deck, or **All decks**.
2. Answer each question. Right or wrong shows straight away.
3. A wrong answer comes back later in the same round.
4. At the end: your score and the words you got wrong.

## Which words come up

Drills have no FSRS schedule. Each card keeps a small score per drill:

- A wrong answer raises it, a right answer lowers it.
- A round picks the words with the highest score first, then words you have not drilled yet.

So the words you always get wrong come up the most.

## Data

One new table:

| Table | Fields | Index |
|---|---|---|
| `drillStats` | `id` (`cardId:drill`), `cardId`, `drill`, `right`, `wrong`, `lastAt` | `id, cardId, drill` |

- Deleting a card deletes its drill stats.
- The table is in backups.

Drill time counts toward the deck's topic, like question practice does.

## Later

**Adjective endings** (*ein gut**er** Hund*, *mit dem gut**en** Hund*). This one needs grammar rules in the app (case, gender, article type), not only card fields, so it comes after the first three.

## Why this way

German-only apps such as [KasusKnacker](https://apps.apple.com/app/id6757100358), [German Case Practice](https://apps.apple.com/app/id1247446191) and Der Die Das drill gender, cases and verbs, because these are the hardest part of German for most learners. Lernzeit can drill the same things using the words you already study, so you practise grammar on your own words.

## Known limits

- Only cards with a gender, a plural or verb forms can be drilled.
- The verb drill only knows the forms written on the card. A missing form is not guessed.
