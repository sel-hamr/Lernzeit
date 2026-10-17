<div align="center">

<img src="public/favicon.svg" width="64" height="64" alt="Lernzeit logo" />

# Lernzeit

**A quiet study companion for daily German and AI learning.**

Flashcards with spaced repetition, daily goals per topic, a focus timer, streaks and charts, and a to-do board.<br />
Everything lives in your browser, works offline, and installs on your phone.

![React](https://img.shields.io/badge/React-19-22302A?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-22302A?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-22302A?style=flat-square&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-22302A?style=flat-square&logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-offline_ready-22302A?style=flat-square&logo=pwa&logoColor=white)

[Features](#features) · [Quick start](#quick-start) · [Install on your phone](#install-on-your-phone) · [AI connection](#ai-connection) · [Shortcuts](#keyboard-shortcuts) · [Project structure](#project-structure)

<br />

<img src="docs/screenshots/showcase.webp" alt="Lernzeit dashboard on a laptop next to the timer, goals and flashcard screens" width="100%" />

</div>

<br />

## At a glance

- **Local-first.** No account and no server. Your cards, sessions and tasks are stored in IndexedDB.
- **Works offline.** A service worker caches the app, and the Geist font is bundled.
- **Remembers for you.** Cards are scheduled with FSRS, so you review each word right before you'd forget it.
- **Always in sync.** Every view reads live queries, so a change shows up instantly, even in other tabs.
- **Light and dark.** Follows your system theme, or pick one.

## Features

| Page | What it does |
|---|---|
| **Today** | Progress per topic with time left, today's sessions, cards due, word of the day, tasks due today |
| **Focus timer** | Countdown, Pomodoro and free mode. Keeps running through a refresh, a closed tab or a sleeping phone |
| **Flashcards** | Word, sentence and cloze cards, three practice directions, typing and listening modes |
| **Stories** | Short German stories read with your decks: words light up by how well you know them, and any word can become a card |
| **Questions** | German questions like in the speaking part of an exam: write your own answer once, then answer from memory and compare |
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
- Three practice directions per deck: Image → German, English → German and German → English. Scheduling uses FSRS ([ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)). Daily limits are set per deck and count new words, not directions.
- **Always a word to practise.** When nothing is due, **Practise** starts a round of 20 cards ahead of schedule: studied cards that are due soonest first, then new cards past the daily limit. A practised card comes back soon: at most 10 minutes after Again, 1 hour after Hard, 1 day after Good and 2 days after Easy. **Practise more** at the end starts another round, with other words: a card rated in the last hour comes last.
- **No word twice in a row.** After a card, the next one is always a different word, even after **Again** or when another direction of the same word is waiting. A word repeats only when it is the last one left in the session.
- **Typing mode** accepts small slips (`ue` for `ü`, a missing umlaut, lowercase, a missing article), then shows the exact spelling and highlights the wrong letters.
- **Listening mode** plays the German and you type what you hear. Speed buttons (0.6×, 0.8×, 1×, 1.2×) sit next to the speaker.
- **Mute** stops the German from playing by itself when the answer is shown. The speaker button still plays it when you tap it. It is the same switch as *Play audio when the answer is shown* in Settings.
- Add images by uploading, pasting with <kbd>Ctrl</kbd>+<kbd>V</kbd> or dropping a file. They are resized to 600 px wide WebP before saving. A card can use an emoji instead, and the editor links to an image search for the word.
- The **+** button quick-adds an English and German pair, tagged `incomplete`.
- Review time can count toward the deck's topic automatically.

</details>

<details>
<summary><b>Stories</b></summary>
<br />

- Every word that is in one of your decks is highlighted by how well you know it: <b>yellow</b> for new, <b>green</b> for learning, a thin underline once it is known (next review three weeks or more away). Nouns take their gender colour.
- Words are found in their forms too: plurals, verb endings, past tenses from the card's verb forms, adjective endings, *im* for *in*, *ihn* for *er*.
- Tap a word to see its card with the picture, the English and the audio. A word that is not in a deck can be added in one step, with the story's sentence as its example.
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
<summary><b>History</b></summary>
<br />

A week calendar with every session, a day view (goal hit or missed, notes), a 16-week heatmap you can filter by topic, streaks, hours per topic per week or month, and flashcard stats: total, learned, due, retention and reviews per day.

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

Topics and per-weekday goals, decks, Pomodoro lengths, end sound, German voice and speed, typing and listening modes, which study time counts automatically (reviews, reading, question practice), light/dark/system theme, goal reminders, JSON backup and restore, "protect storage" and reset.

</details>

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
| `npm test` | Runs the unit tests (Vitest) |
| `npm run lint` | Runs ESLint |
| `npm run typecheck` | Runs the TypeScript compiler only |

## Install on your phone

1. Run `npm run build`.
2. Deploy `dist/` to any static host with HTTPS, such as Netlify, Vercel, Cloudflare Pages or GitHub Pages.
3. Open the site on your phone and choose **Add to Home screen**.

> [!NOTE]
> The app uses client-side routing, so the host must serve `index.html` for every unknown path.

## AI connection

An AI app such as Claude Code can add decks, cards, stories, practice questions, tasks and study time to Lernzeit through the MCP server in [`mcp/`](mcp). It never reads your cards or history, and it cannot edit or delete anything. Your data stays in the browser: the server passes each request to the open Lernzeit tab, which saves it.

Set it up in two steps: add the server to your AI app with a token, then turn on **Settings → AI connection** in the browser you want. [docs/mcp-bridge.md](docs/mcp-bridge.md) has the details.

## Starter content

On first launch Lernzeit creates two topics, **German** (150 min a day) and **AI** (120 min a day), plus these decks:

| Deck | Cards | Source |
|---|---:|---|
| My Words | 53 | Your personal word list, kept in its order. Words that were also in the starter pack were moved here, so nothing is learned twice |
| German Top Words | 562 | `src/db/starter/german-starter.json` |
| German Everyday Sentences | 54 | `src/db/starter/german-starter.json` |
| AI terms | 0 | Empty, ready for your own cards |

Each card uses its emoji as its picture. Nine words use the illustrations from the design mockups instead, and cards without a picture show their first letter. Image → German is only asked for nouns, because an emoji for a verb or adjective could mean several words. A **Show a hint** link helps when a picture is ambiguous.

Deleted some starter cards? **Settings → Decks → Starter decks** adds them back without creating duplicates.

There are also 103 short stories written with these words: three longer ones to start with, then 100 easy A1 stories about home and family, food, town and travel, and work, school and free time. **Stories → Starter stories** adds back any that are missing.

And 45 questions in six sets, each with its English, a suggested answer and useful words: *Sich vorstellen*, *Familie und Freunde*, *Freizeit*, *Arbeit und Schule*, *Wohnen und Alltag* and *Beim Arzt und auf dem Amt*. **Questions → Starter questions** adds back any that are missing.

### Bring your own cards

- **CSV** with the columns `english, german, gender, plural, example_de, example_en, tags, deck`, plus an optional `emoji` column.
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
| <kbd>Enter</kbd> | Questions practice | Answer, then go to the next question |
| <kbd>Shift</kbd> + <kbd>Enter</kbd> | Questions practice | New line in your answer |
| <kbd>Esc</kbd> | Questions practice | Back to the questions |

## Project structure

```
src/
├── app/          App shell, routing, global dialogs, background engines (timer, reminders, theme, AI bridge)
├── bridge/       The AI connection: messages shared with mcp/, actions, WebSocket client
├── components/   Shared UI: buttons, dialogs, form controls, chips, station clock, card image
├── data/         Database actions (timer, cards, topics, tasks, import/export) and React hooks
├── db/           Dexie schema, types, first-run seed
├── features/     One folder per page: today, timer, flashcards, stories, questions, history, board, settings
├── lib/          Pure logic: time maths, goals and streaks, FSRS wrapper, review queue,
│                 answer checking, German helpers, story word matching, question practice order, image resizing, speech, sounds
└── index.css     Design tokens (colours, type scale, radii) for light and dark themes
mcp/              MCP server for AI apps (an npm workspace)
```

The logic that decides correctness lives in `src/lib` and `src/data` as plain functions, covered by `src/lib/core.test.ts`, `src/lib/reader.test.ts`, `src/lib/questions.test.ts` and `src/data/data.test.ts`. The data tests run against an in-memory IndexedDB.

## Tech stack

| Area | Tools |
|---|---|
| UI | React 19, TypeScript, Tailwind CSS 4, lucide-react, Geist font |
| Build | Vite, vite-plugin-pwa |
| Data | Dexie (IndexedDB), dexie-react-hooks |
| Learning | ts-fsrs |
| Interaction | dnd-kit, Recharts |
| Quality | Vitest, ESLint, fake-indexeddb |

## Good to know

Reminders and end-of-timer notifications use the browser's Notification API. With no server behind the app, they only fire while it is open or running in the background as an installed PWA. They can't wake a closed app.

## More

- [SPEC.md](SPEC.md): the full product spec
- [design/](design/): the original design mockups for Today, Timer, Flashcards and History
