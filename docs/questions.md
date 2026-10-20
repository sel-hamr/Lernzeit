# Questions

Practise answering German questions, the way the speaking part of an exam asks them. Lernzeit shows a question, you type your answer, and the app shows what you wrote next to your own prepared answer, its suggested answer and your old responses.

There is no grading. You see the answers side by side and judge for yourself.

## Where things live

| Part | File | Job |
|---|---|---|
| Practice logic | [src/lib/questions.ts](../src/lib/questions.ts) | Groups questions by set, picks the practice order, compares your answer with the one you wrote |
| Data | [src/data/questions.ts](../src/data/questions.ts) | Save and delete questions, save responses, starter questions |
| Active time | [src/data/studyTime.ts](../src/data/studyTime.ts) | Counts practice time while the page is in use, shared with story reading |
| Starter questions | [src/languages/de/questions.ts](../src/languages/de/questions.ts) | The German pack's 45 questions in six sets, with useful words. Other packs have theirs in `src/languages/<code>/texts.ts` |
| Pages | [src/features/questions/](../src/features/questions) | Questions list, editor, practice |
| AI | [src/bridge/actions.ts](../src/bridge/actions.ts), [mcp/src/tools.ts](../mcp/src/tools.ts) | The `create_questions` tool and the `make_questions` prompt |

## A question

| Field | Example | Notes |
|---|---|---|
| Question | Was ist dein Beruf? | German, read aloud with the speaker button |
| English | What is your job? | Shown in the list and after you answer |
| Your answer | Ich bin Softwareentwickler. | Your real answer about your life. You write it in the editor, also from practice |
| Suggested | Ich arbeite als Entwickler. | An example from a starter set or from Claude. Can be empty |
| Useful words | Lehrer, die Ärztin, arbeiten als | Offered as hints in practice. Typed with commas in the editor |
| Set | Arbeit und Schule | The group it is listed and practised in. Empty means *My questions* |
| Level | A2 | Optional, A1 to C2 |

A personal question has no single right answer, so **Your answer** is the one you practise. **Suggested** shows the sentence pattern.

## The Questions page

Each set is a card with its name, how many questions it has and how many have your answer. **Show questions** opens the list under the card, **Add** adds a question to the set, and **Practise** starts a round with it. **Practise all** at the top takes every question.

Tap a question to edit it and write your answer.

## Practice

Two buttons under the question help while you answer:

| Button | What it does |
|---|---|
| **English** | Shows the English under the question. It stays on for the next questions, in this browser |
| **Words** | Shows words you can use: the question's useful words, then the words of your answer (or the suggested one) shuffled. Tap one to add it to your answer; used ones turn grey |

Then:

| Button | What happens |
|---|---|
| **Answer** | Saves what you typed as a response, then shows the answers. <kbd>Enter</kbd> does the same; <kbd>Shift</kbd>+<kbd>Enter</kbd> starts a new line |
| **Show answer** | Shows the answers without typing first. Nothing is saved |
| **Skip** | Goes to the next question |

After **Answer** or **Show answer**:

- **You:** what you just typed, after **Answer** only. A chip compares it with **Your answer** (below).
- **Your answer**, **Suggested** and **English**, each only when it has text. With no answer of your own yet, **Write your answer** opens the editor.
- **Old responses:** your earlier answers to this question, newest first with the date. The last three show; **Show all** shows the rest.
- **Next** (or <kbd>Enter</kbd>) goes on. <kbd>Esc</kbd> ends practice.

### Comparing with your answer

| Chip | When | Shown |
|---|---|---|
| Matches your answer | The same, apart from spacing and punctuation | Your text |
| Almost your answer | A slip the typing mode accepts (capitals, *ue* for *ü*), or at least 75% of the letters line up | Your text letter by letter: wrong and extra letters in red, missing ones in green, an extra or missing space as ␣ |
| Different from your answer | Another sentence | Your text, in a neutral chip: a different answer is not a mistake |

### Order

No grades means no schedule, so practice brings every question back in turn: first the questions you have never answered, in list order, then the ones answered longest ago. The order is fixed when a round starts; **Practise again** starts a new round with your new answers.

### Practice time

Active practice time is saved as a study session, the way reading time is: one session per visit that grows while you work, once it reaches a minute. It goes to the topic of the first deck that has one (German, out of the box), with the note *Questions: set name*. A running timer for that topic already counts the time, so nothing is saved then. **Settings → Count question practice as study time** turns it off.

## Data

Questions are not flashcards: they have no FSRS reviews and no grades. So they have their own tables, schema version 3.

| Table | Fields | Index |
|---|---|---|
| `questions` | `id`, `set`, `question`, `english`, `myAnswer`, `suggested`, `words`, `level`, `tags`, `createdAt`, `updatedAt` | `id, set, createdAt` |
| `responses` | `id`, `questionId`, `text`, `at` | `id, questionId, at` |

- Deleting a question deletes its responses.
- Sets are listed in the order their first question was added, and their questions oldest first.
- Both tables are in backups. Backups made before questions still restore.

## Starter questions

Added with their level of the German pack ([languages.md](languages.md)). **Questions → Starter questions** adds back any that are missing from the levels you have, matched by id.

| Set | Level | Questions |
|---|---|---:|
| Sich vorstellen | A1 | 12 |
| Familie und Freunde | A1 | 6 |
| Freizeit | A1 | 7 |
| Arbeit und Schule | A2 | 7 |
| Wohnen und Alltag | A2 | 7 |
| Beim Arzt und auf dem Amt | A2 | 6 |

Each has its English, a suggested answer and four to six useful words. **Your answer** is empty until you write it.

## AI

The `create_questions` tool on the AI connection ([mcp-bridge.md](mcp-bridge.md)) adds questions with English, a suggested answer and useful words to a set, and the `make_questions` prompt asks for a set on a theme ("make 10 A2 questions about work"). Claude never writes **Your answer**, and it cannot read your answers.

## Why this way

| App | How it practises questions |
|---|---|
| [Pimsleur](https://en.wikipedia.org/wiki/Pimsleur_Language_Programs) | A prompt, a pause to answer out loud, then the correct answer. You check yourself |
| Anki [dialogue decks](https://ko-fi.com/s/4c97d0dc8c) | Question on the front; possible answers, English and audio on the back |
| [Goethe A1, Sprechen](https://open-exam-prep.com/study-guides/goethe-a1/mastering-sprechen-speaking/sprechen-teil-2-questions) | Personal questions you can prepare, and questions you form from a topic and a word |
| Duolingo, Babbel | Avoid open answers: multiple choice, word banks, or AI checking |

Lernzeit follows the self-check model: show the question, answer first, then compare. Keeping your old responses is what the others do not do: you see how your answer to the same question improved.

## Known limits

- The app compares texts; it cannot tell whether a different answer is correct German. For corrections, paste your answers into your AI app; the AI connection cannot read them.
- Speech input is not supported yet. Answer out loud before typing if you want to practise speaking.
