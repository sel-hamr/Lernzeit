<div align="center">

<img src="public/favicon.svg" width="64" height="64" alt="Lernzeit logo" />

# Lernzeit

**A quiet study companion for learning German, explained in English.**

Flashcards with spaced repetition, daily goals per topic, a focus timer, streaks and charts, and a to-do board.<br />
Everything lives in your browser, works offline, and installs on your phone.

![React](https://img.shields.io/badge/React-19-22302A?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-22302A?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-22302A?style=flat-square&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-22302A?style=flat-square&logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-offline_ready-22302A?style=flat-square&logo=pwa&logoColor=white)

[Features](#features) · [German levels](#german-levels) · [Quick start](#quick-start) · [Install on your phone](#install-on-your-phone) · [AI connection](#ai-connection) · [Shortcuts](#keyboard-shortcuts) · [Project structure](#project-structure)

<br />

<img src="docs/screenshots/showcase.webp" alt="Lernzeit dashboard on a laptop next to the timer, goals and flashcard screens" width="100%" />

</div>

<br />

## At a glance

- **Your own words.** Lernzeit opens empty and ready: add your words and start practising. Ready-made German levels are there if you want them.
- **Local-first.** No account and no server. Your cards, sessions and tasks are stored in IndexedDB.
- **Works offline.** A service worker caches the app, and the Geist font is bundled.
- **Practise a whole deck.** Open a deck's tab, pick the practice directions and go through every card. Each session's time is saved, and Practice history shows them all.
- **Always in sync.** Every view reads live queries, so a change shows up instantly, even in other tabs.
- **Light and dark.** Follows your system theme, or pick one.

## Features

| Page | What it does |
|---|---|
| **Today** | Progress per topic with time left, today's sessions, flashcard practice time, word of the day, tasks due today |
| **Focus timer** | Countdown, Pomodoro and free mode. Keeps running through a refresh, a closed tab or a sleeping phone |
| **Flashcards** | Your decks, each practised whole in the directions you pick, practice history, word, sentence and cloze cards, typing and listening modes |
| **Grammar** | A course from A1 to B1: 27 topics with the rule, examples and 384 explained exercises of four kinds, a path with progress, and spaced review. Your own topics and words too |
| **Stories** | Short German stories read with your decks: words light up by how well you know them, and any word can become a card |
| **Questions** | German questions like in the speaking part of an exam: write your own answer once, then answer from memory and compare |
| **Docs** | Paste Markdown into nested folders and read it like a README. Pinned and recent docs, tags, read status, search, and it reopens where you stopped |
| **History** | Week calendar, 16-week heatmap, streaks, hours per topic and flashcard stats |
| **Board** | Backlog, To do, Doing and Done, with drag and drop on desktop and touch |
| **Settings** | Goals per weekday, decks, voice and speed, themes, reminders, backup and restore |

<details>
<summary><b>Today</b></summary>
<br />

Shows progress per topic with the time left, start buttons, today's sessions, cards due, the word of the day and tasks due today. **Log time** adds study you did away from the timer.

</details>

<details>
<summary><b>Focus timer</b></summary>
<br />

- Three modes: countdown (defaults to the time left today), Pomodoro (focus and break lengths are in Settings) and free.
- The timer is stored as timestamps, so it survives a refresh, a closed tab or a sleeping phone.
- Plays a bell at the end and asks *"What did you learn?"*
- A session that runs past midnight is split between the two days.

</details>

<details>
<summary><b>Flashcards</b></summary>
<br />

- Word, sentence and cloze cards (`Der Hund {{spielt}} im Garten.`), coloured by gender: <b>der</b> blue, <b>die</b> red, <b>das</b> green.
- **Deck tabs on one line.** The decks that fit show as tabs, each with its number of cards; the rest go in a **More** menu at the end of the row, with a filter for long lists. The open deck always shows as a tab. There are no due counts.
- **Practise a deck.** On a deck's tab, **Practise deck** asks which practice directions to take: Image → German, English → German, German → English or Cloze, each with its number of cards. On **All**, **Practise** does the same for every deck. The session asks every card in those directions, and your rating says when a card comes back: **Again** 3 cards later, **Hard** 8 cards later, **Good** 15 cards later, and **Easy** not again. Each button shows it. The top of the session counts how often you pressed each button and how many cards are left. The session ends once every card is rated **Easy**, and shows the same counts. Ratings are still kept with FSRS ([ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)).
- **Practice history.** Every session is saved after each rating, so one you leave half-way counts too: when it started and ended, the time spent on the cards (at most two minutes a card), the reviews and how many were right, the directions, and the time per deck. The clock button in Flashcards shows them day by day, with totals, the time per deck, and a filter for one deck. Today shows today's practice time, and History the last 30 days'. Sessions are part of backups.
- **Practise the cards you pick.** **Select** in Flashcards turns on select mode: tap cards to tick them, or **Select all** the cards shown. Picks stay when you change the deck or filter, so one round can mix decks. **Practise** asks only those cards, in the order you picked them, in each direction their deck practises, and brings them back by your rating like a deck. **Practise again** at the end repeats the same cards.
- **No word twice in a row.** After a card, the next one is always a different word, even after **Again** or when another direction of the same word is waiting. A word repeats only when it is the last one left in the session.
- **Typing mode** accepts small slips (`ue` for `ü`, a missing umlaut, lowercase, a missing article), then shows the exact spelling and highlights the wrong letters.
- **Listening mode** plays the German and you type what you hear. Speed buttons (0.6×, 0.8×, 1×, 1.2×) sit next to the speaker.
- **Thorsten voice (offline).** A natural German voice that runs on your device, for every speaker button when you learn German: cards, stories and questions. Pick it under Settings → German voice; it downloads once (63 MB) and then needs no internet, key or account. Each clip is made once and saved, and Review makes the next card's audio while you think. The browser voice speaks until the download is done. Voice by Thorsten Müller ([Thorsten-Voice](https://github.com/thorstenMueller/Thorsten-Voice), public domain).
- **Voice** in the sidebar, or the voice name at the top on phones, changes the voice from any page: Thorsten or one of your browser's voices, the same choice as in Settings. Picking Thorsten before it is downloaded opens Settings, where it downloads.
- **Mute** stops the German from playing by itself when the answer is shown. The speaker button still plays it when you tap it. It is the same switch as *Play audio when the answer is shown* in Settings.
- Add images by uploading, pasting with <kbd>Ctrl</kbd>+<kbd>V</kbd> or dropping a file. They are resized to 600 px wide WebP before saving. A card can use an emoji instead, and the editor links to an image search for the word.
- The **+** button quick-adds an English and German pair, tagged `incomplete`.
- Review time can count toward the deck's topic automatically.

</details>

<details>
<summary><b>Grammar</b></summary>
<br />

- A grammar course that stands on its own: 27 topics from A1 to B1 in seven sections (nouns and articles, cases, pronouns, prepositions, verbs, sentences, adjectives). Each has **the rule** with tables, **examples** you can listen to, and 12 to 16 **exercises**: 384 in all.
- **Four kinds of exercise:** fill the gap (pick with <kbd>1</kbd>–<kbd>4</kbd> or type), find the mistake (tap the wrong word), put the words in order (tap them), and write the sentence (rewrite or translate).
- **Every answer is explained.** After each one you read why it is right, such as *helfen takes the dative: dem Mann*, and **Ask Claude why** opens a Claude chat with the exercise, your answer and the rule, for more examples.
- **A path to follow.** Topics are ordered by level with a ring that fills as you learn them; **Continue** takes you to the next one. A topic is mastered when you know 80% of its exercises.
- **Review that keeps it learned.** A wrong answer comes back in the same round and again minutes later; right answers come back after 1, 3, 7, 16, 35 and 75 days. **Start review** mixes everything due from every topic.
- Topics that fit your cards also ask about **your own words**: *Der, die, das* your nouns' genders, *Plural* their plurals, *Präsens*, *Präteritum* and *Perfekt* your verbs in that tense, from the card's **conjugation** (six forms per tense, never built by rules; all 139 starter verbs have one).
- **Add your own** topics and exercises in the editor, in plain text, or let your AI app write them with `add_grammar` (see [AI connection](#ai-connection)). Starter topics can be edited too.
- `ue` for `ü` and lowercase are accepted, but a missing umlaut is wrong, because *Äpfel* and *fährst* are the point. Active practice time can count toward German. [docs/grammar.md](docs/grammar.md) has the details.

</details>

<details>
<summary><b>Stories</b></summary>
<br />

- Every word that is in one of your decks is highlighted by how well you know it: <b>yellow</b> for new, <b>green</b> for learning, a thin underline once it is known (next review three weeks or more away). Nouns take their gender colour.
- Words are found in their forms too: plurals, verb endings, past tenses from the card's verb forms, adjective endings, *im* for *in*, *ihn* for *er*.
- Tap a word to see its card with the picture, the English and the audio. A word that is not in a deck can be added in one step, with the story's sentence as its example.
- In stories written by AI, the words you need help with explain themselves, and hard words go further: the meaning, why the word has this form in this sentence, one more example, and a tip.
- A bar shows how much of the story you know, are learning, have in a deck but not studied yet, or do not have. Reading is easy from about 95% known.
- Listen to each paragraph, show the English translation under it, and mark the story as read. Active reading time can count toward the story's topic.
- **Write with AI** builds a prompt with every word of the deck you pick, marking the ones you know or are learning, at your level and theme. Paste it into Claude Desktop or Claude Code: Claude writes the story and saves it here through the [AI connection](#ai-connection).
- Write or paste your own stories, or let your AI app add them directly (see [AI connection](#ai-connection)). [docs/stories.md](docs/stories.md) explains how words are matched.

</details>

<details>
<summary><b>Questions</b></summary>
<br />

- Each question has the German, the English, **your answer** (your real answer, about your life) and a **suggested answer** that shows the sentence pattern. Questions are grouped in sets, such as *Sich vorstellen* or *Arbeit und Schule*.
- Each set is a card: **Show questions** opens its list, **Add** adds one, **Practise** starts a round.
- Practise a set or all of them. **English** shows the translation of the question, and **Words** offers words you can use, which you tap to add. Type your answer, then tap **Answer** to see it next to your answer and the suggested one. Small slips are marked letter by letter, the way typing mode marks them. **Show answer** shows the answers without typing first, and **Skip** moves on.
- Every answer you type is kept. Under the answers, **Old responses** lists the last three with their date, and **Show all** the rest, so you can see how your answer improved.
- There is no grading. Questions you have not answered come first, then the ones you answered longest ago.
- Listen to the question and the answers. Active practice time can count toward German.
- Your AI app can add questions with a suggested answer, never your own (see [AI connection](#ai-connection)). [docs/questions.md](docs/questions.md) has the details.

</details>

<details>
<summary><b>Docs</b></summary>
<br />

- Paste Markdown into folders, with folders inside folders. A `# Heading` becomes the title.
- Docs read like a GitHub README: tables, task lists, code with colours and a Copy button, images, and a table of contents.
- Pin docs, see recent ones, add tags, mark docs as *To read* or *Read*, and search them here or in the app's main search.
- A doc reopens where you stopped. Paste an image and it is saved in the app, so it works offline.
- Docs are general reading, so they belong to no topic or language. Your AI app can save and read them too. [docs/docs.md](docs/docs.md) has the details.

</details>

<details>
<summary><b>History</b></summary>
<br />

A week calendar with every session, a day view (goal hit or missed, notes), a 16-week heatmap you can filter by topic, streaks, hours per topic per week or month, and flashcard stats: total, learned, practice time over 30 days, retention and reviews per day.

When you change a goal, the new value applies from that day on, so past days keep the goal they had.

</details>

<details>
<summary><b>Board</b></summary>
<br />

Four columns: Backlog, To do, Doing and Done. Drag cards between columns and reorder them within a column, on desktop and touch. Filter by topic, by priority, or by **Today** (due today or overdue). Overdue dates show in red.

</details>

<details>
<summary><b>Settings</b></summary>
<br />

Your German levels, topics and per-weekday goals, decks, Pomodoro lengths, end sound, the voice (browser, or the offline Thorsten voice) and speed, typing and listening modes, which study time counts automatically (reviews, reading, question practice, grammar practice), light/dark/system theme, goal reminders, JSON backup and restore, "protect storage" and reset.

</details>

## German levels

Lernzeit starts empty, so you can go straight to adding your own words. If you want ready-made content, **Settings → Starter content** adds a level, A1, A2 or B1: word and sentence decks, short stories, speaking questions and grammar topics, with a German topic for your study time.

[docs/languages.md](docs/languages.md) explains the pack.

## Quick start

You need Node 20 or newer.

```bash
git clone https://github.com/sel-hamr/Lernzeit.git
cd Lernzeit
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

| Command | What it does |
|---|---|
| `npm run dev` | Starts the dev server |
| `npm run build` | Type-checks and builds to `dist/`, including the service worker |
| `npm run preview` | Serves the production build on http://localhost:4173 |
| `npm start` | Builds if the code changed, then serves and opens the production build (the same as `lz`) |
| `npm test` | Runs the unit tests (Vitest) |
| `npm run lint` | Runs ESLint |
| `npm run typecheck` | Runs the TypeScript compiler only |

### The `lz` command

To start Lernzeit from any folder, link it once in the project folder:

```bash
npm link
```

| Command | What it does |
|---|---|
| `lz` | Builds when the code changed since the last build, then serves the production build on http://localhost:5173 and opens it. Stop it with <kbd>Ctrl</kbd>+<kbd>C</kbd> |
| `lz --build` | Builds again even when nothing changed |
| `lz <script>` | Runs any npm script of the project, such as `lz dev` or `lz test`. Extra words go to the script |

If Lernzeit is already running, `lz` only opens it. `lz` runs the TypeScript file directly, so it needs Node 22.18 or newer, like the [MCP server](#ai-connection). `npm unlink -g lernzeit` removes it.

> [!NOTE]
> `lz` uses the dev server's port on purpose: the browser keeps data per address, so the build and `npm run dev` see the same cards and history. Only one of them can run at a time, and `lz` says so when the dev server is running. The build installs a service worker for offline use; the next time the dev server runs, it replaces that worker with one that removes itself, and the page reloads once.

## Install on your phone

1. Run `npm run build`.
2. Deploy `dist/` to any static host with HTTPS, such as Netlify, Vercel, Cloudflare Pages or GitHub Pages.
3. Open the site on your phone and choose **Add to Home screen**.

> [!NOTE]
> The app uses client-side routing, so the host must serve `index.html` for every unknown path.

## AI connection

An AI app such as Claude Code can add decks, cards, stories, practice questions, grammar topics and exercises, tasks and study time to Lernzeit through the MCP server in [`mcp/`](mcp). It can also read your cards, move them to another deck, and delete the ones you name, or a whole deck, with their progress. It never sees your review history, answers or notes, and cannot edit or delete anything else. Your data stays in the browser: the server passes each request to the open Lernzeit tab, which saves it.

Set it up in two steps:

1. Run `npm run mcp:setup`. It adds the server to Claude Code and Claude Desktop and prints a token.
2. In the browser you want, open **Settings → AI connection**, turn it on and paste the token.

[docs/mcp-bridge.md](docs/mcp-bridge.md#setup) has the details.

## Starter content

The German pack is the starter content: nothing is added until you ask for it. [docs/languages.md](docs/languages.md) lists what each level holds.

| Deck | Cards | Source |
|---|---:|---|
| My Words | 53 | Your personal word list, kept in its order. Words that were also in the top words were moved here, so nothing is learned twice |
| German Top Words | 562 | `src/languages/de/words.json` |
| German Everyday Sentences | 54 | `src/languages/de/words.json` |

Each card uses its emoji as its picture. Nine German words use the illustrations from the design mockups instead, and cards without a picture show their first letter. Image → word is only asked for nouns, because an emoji for a verb or adjective could mean several words. A **Show a hint** link helps when a picture is ambiguous.

The pack also has 103 short stories written with these words, 45 questions in six sets (*Sich vorstellen*, *Familie und Freunde*, *Freizeit*, *Arbeit und Schule*, *Wohnen und Alltag*, *Beim Arzt und auf dem Amt*) and the 27 grammar topics. Deleted some? **Stories → Starter stories**, **Questions → Starter questions** and **Grammar → Starter topics** add back the missing ones of the levels you have; installing a level again adds back its cards.

### Bring your own cards

- **CSV** with the columns `english, german, gender, plural, example_de, example_en, tags, deck`, plus optional `emoji`, `verb_forms` and `present`, `past`, `perfect` columns. Each tense column holds six forms separated by commas, for verb questions in Grammar.
- **Card pack**: a JSON file with `"format": "lernzeit-cards"`, shaped like the starter file. Importing a pack again only adds the cards you don't have yet.

## Keyboard shortcuts

| Key | Where | Action |
|---|---|---|
| <kbd>/</kbd> | Anywhere | Search cards and tasks |
| <kbd>Space</kbd> | Focus timer | Start or pause |
| <kbd>Space</kbd> | Review | Show the answer, then press again to rate it Good |
| <kbd>1</kbd> – <kbd>4</kbd> | Review | Rate Again, Hard, Good or Easy |
| <kbd>Z</kbd> | Review | Undo the last rating |
| <kbd>Esc</kbd> | Review | Back to the library |
| <kbd>1</kbd> – <kbd>4</kbd> | Grammar practice | Pick a choice; der, die, das are always 1, 2, 3 |
| <kbd>Enter</kbd> | Grammar practice | Check a typed answer or word order, then go to the next question |
| <kbd>Backspace</kbd> | Grammar practice | Take back the last word when putting words in order |
| <kbd>Esc</kbd> | Grammar practice | Back to the topic |
| <kbd>Enter</kbd> | Questions practice | Answer, then go to the next question |
| <kbd>Shift</kbd> + <kbd>Enter</kbd> | Questions practice | New line in your answer |
| <kbd>Esc</kbd> | Questions practice | Back to the questions |

## Project structure

```
src/
├── app/          App shell, routing, global dialogs, background engines (timer, reminders, theme, AI bridge)
├── bridge/       The AI connection: messages shared with mcp/, actions, WebSocket client
├── components/   Shared UI: buttons, dialogs, form controls, chips, station clock, card image
├── data/         Database actions (timer, cards, topics, tasks, import/export), speaking with saved clips, and React hooks
├── db/           Dexie schema and types
├── features/     One folder per page: today, timer, flashcards, grammar, stories, questions, docs, history, board, settings
├── languages/    The German pack
├── lib/          Pure logic: time maths, goals and streaks, FSRS wrapper, review queue,
│                 answer checking, German helpers, grammar topics and practice rounds, story word matching,
│                 question practice order, image resizing, browser speech, the Thorsten voice worker, sounds
└── index.css     Design tokens (colours, type scale, radii) for light and dark themes
bin/              The `lz` command: builds when needed and serves the production build
scripts/          `mcp:setup`: adds the MCP server to Claude Code and Claude Desktop
mcp/              MCP server for AI apps (an npm workspace)
```

The logic that decides correctness lives in `src/lib` and `src/data` as plain functions, covered by `src/lib/core.test.ts`, `src/lib/grammar.test.ts`, `src/lib/drills.test.ts`, `src/lib/conjugation.test.ts`, `src/lib/reader.test.ts`, `src/lib/questions.test.ts`, `src/data/data.test.ts` and `src/data/languages.test.ts`. The data tests run against an in-memory IndexedDB. `src/languages/languages.test.ts` checks the German pack.

## Tech stack

| Area | Tools |
|---|---|
| UI | React 19, TypeScript, Tailwind CSS 4, lucide-react, Geist font |
| Build | Vite, vite-plugin-pwa |
| Data | Dexie (IndexedDB), dexie-react-hooks |
| Learning | ts-fsrs |
| Voice | Piper through @mintplex-labs/piper-tts-web and onnxruntime-web, Thorsten voice |
| Interaction | dnd-kit, Recharts |
| Quality | Vitest, ESLint, fake-indexeddb |

## Good to know

Reminders and end-of-timer notifications use the browser's Notification API. With no server behind the app, they only fire while it is open or running in the background as an installed PWA. They can't wake a closed app.

The Thorsten voice keeps its model in the browser's private file storage and its clips in IndexedDB (up to 100 MB, oldest dropped first). Clips are not in backups; they are made again when needed. [docs/voice.md](docs/voice.md) explains how it works and why it was chosen.

## More

- [SPEC.md](SPEC.md): the full product spec
- [design/](design/): the original design mockups for Today, Timer, Flashcards and History
