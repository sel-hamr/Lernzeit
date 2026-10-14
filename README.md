# Lernzeit

A personal learning app for daily German and AI study: flashcards with images and spaced repetition, daily goals per topic, a focus timer, history with streaks and charts, and a to-do board. Everything is stored in the browser (IndexedDB), works offline, and installs on a phone as a PWA.

The full product spec is in [SPEC.md](SPEC.md). The design mockups are in [design/](design/).

## Run it

Requires Node 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

| Command | What it does |
|---|---|
| `npm run build` | Type-checks and builds to `dist/` (with the service worker) |
| `npm run preview` | Serves the production build on http://localhost:4173 |
| `npm test` | Runs the unit tests (Vitest) |
| `npm run lint` | Runs ESLint |
| `npm run typecheck` | Runs the TypeScript compiler only |

To install on a phone, deploy `dist/` to any static host with HTTPS (Netlify, Vercel, Cloudflare Pages, GitHub Pages), open it on the phone, and choose "Add to Home screen". Single-page routing needs every unknown path to serve `index.html`.

On first launch the app creates two topics (German 150 min, AI 120 min a day) and these decks:

- **My Words** (53 cards): your personal word list, in its order. Words that the starter pack already had were moved here, so nothing is learned twice.
- **German Top Words** (562) and **German Everyday Sentences** (54): from `src/db/starter/german-starter.json`.
- **AI terms**: empty, for your own cards.

Each card shows its emoji as its picture. Nine words use the illustrations from the design mockups instead, and cards without a picture show their first letter. Image → German is only asked for nouns, because an emoji for a verb or adjective could mean several words. A "Show a hint" link helps when a picture is ambiguous. **Settings → Decks → Starter decks** adds back any starter cards you deleted without duplicating anything.

## Features

**Today**: progress per topic with time left, start buttons, today's sessions, cards due, word of the day, tasks due today. "Log time" adds study done away from the timer.

**Focus timer**: countdown (defaults to the time left today), Pomodoro (focus and break lengths in Settings) and free mode. The timer is stored as timestamps, so it keeps running through a refresh, a closed tab or a sleeping phone. It plays a bell at the end, asks "What did you learn?", and splits a run that crosses midnight between the two days. Space starts and pauses.

**Flashcards**:
- Word, sentence and cloze cards (`Der Hund {{spielt}} im Garten.`), coloured by gender: der blue, die red, das green.
- Three practice directions per deck (Image → German, English → German, German → English), scheduled with FSRS (ts-fsrs). Daily limits are per deck and count new words, not directions.
- Review with Space, then 1–4 (Again, Hard, Good, Easy). Z undoes the last rating.
- Typing mode accepts small slips (`ue` for `ü`, a missing umlaut, lowercase, a missing article) but shows the exact spelling and highlights wrong letters. Listening mode plays the German for you to type.
- Images can be uploaded, pasted with Ctrl+V or dropped. They are resized to 600 px wide WebP before saving.
- The "+" button quick-adds English and German, tagged `incomplete`.
- Import from CSV (`english, german, gender, plural, example_de, example_en, tags, deck`, plus an optional `emoji` column) or from a card pack: a JSON file with `"format": "lernzeit-cards"`, like the starter file. Re-importing a pack only adds the cards you don't have yet.
- Every card can have an uploaded image or an emoji. The editor links to an image search for the card's word, so you can copy a photo and paste it in.
- Review time can count toward the deck's topic automatically.

**History**: week calendar with every session, day view (goal hit or missed, notes), a 16-week heatmap filterable by topic, streaks, hours per topic per week or month, and flashcard stats (total, learned, due, retention, reviews per day). Goal changes apply from the day they are made, so past days keep the goal they had.

**Board**: Backlog, To do, Doing and Done. Drag between columns and reorder within them, on desktop and touch. Filters by topic, priority and Today (due today or overdue). Overdue dates show in red.

**Settings**: topics and per-weekday goals, decks, Pomodoro lengths, end sound, German voice and speed, typing and listening modes, light, dark or system theme, goal reminders (notifications), JSON backup and restore, "protect storage" and reset.

Reminders and end-of-timer notifications use the browser's Notification API. Without a server they only fire while the app is open or running in the background (installed PWA). They can't wake a closed app.

## Code map

```
src/
  app/            App shell, routing, global dialogs, background engines (timer, reminders, theme)
  components/     Shared UI: buttons, dialogs, form controls, chips, station clock, card image
  data/           Database actions (timer, cards, topics, tasks, import/export) and React hooks
  db/             Dexie schema, types, first-run seed
  features/       One folder per page: today, timer, flashcards, history, board, settings
  lib/            Pure logic: time maths, goals and streaks, FSRS wrapper, review queue,
                  answer checking, German helpers, image resizing, speech, sounds
  index.css       Design tokens (colours, type scale, radii) for light and dark themes
```

The logic that decides correctness lives in `src/lib` and `src/data` as plain functions, covered by `src/lib/core.test.ts` and `src/data/data.test.ts`. The data tests use an in-memory IndexedDB. Pages read data through live Dexie queries, so every view updates as soon as anything changes, including in other tabs.

Stack: React 19, TypeScript, Vite, Tailwind CSS 4, Dexie (IndexedDB), ts-fsrs, dnd-kit, Recharts, lucide-react, vite-plugin-pwa, Geist font (bundled, so it works offline).
