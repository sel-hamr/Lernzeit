# Lernzeit — Personal Learning Web App

> **For Claude:** This file is the full spec for a personal web app called **Lernzeit** ("learning time" in German). Please build it step by step, following the **Build phases** at the end. Start with Phase 1. After each phase, stop, show me how to run the app, and wait for my OK before the next phase. Follow the **Design** section exactly for the look. Ask me if anything is unclear.

## 1. What this app is

One web app for my daily learning. It combines:

1. **Flashcards** (like Anki), with English + German + an image on every card
2. **Daily goals** per topic (for example German 2h30 per day, AI 2h per day)
3. **A focus timer** that subtracts studied time from today's goal
4. **History**, to see my progress and whether I hit my goals
5. **A to-do board** (like Jira) for things I need to do later

Main use: learning **German** (my learning language) and **AI** (a study topic).

---

## 2. Tech stack

| Part | Choice |
|---|---|
| Framework | React + Vite + TypeScript |
| Styling | Tailwind CSS, with the colors and sizes from the **Design** section |
| Font and icons | Geist (Google Fonts), lucide-react icons |
| Local database | IndexedDB with **Dexie.js** (data stays on my device and works offline) |
| Spaced repetition | **ts-fsrs** (the FSRS algorithm used by modern Anki) |
| Drag and drop | **dnd-kit** |
| Charts | **Recharts** |
| Audio | Browser `speechSynthesis` with a German voice (`de-DE`), free with no API |
| Phone | PWA (installable on my phone, works offline) |

Requirements:
- Light mode first, matching the **Design** section. Dark mode can come later.
- Works well on phone screens
- Simple, calm, clean UI

---

## 3. Flashcards

### 3.1 Card fields

| Field | Required | Example |
|---|---|---|
| English | yes | dog |
| German | yes | Hund |
| Gender (for nouns) | no | der / die / das |
| Plural (for nouns) | no | die Hunde |
| Verb forms (for verbs) | no | gehen – ging – gegangen |
| Image | recommended | photo of a dog |
| Example sentence (German) | no | Der Hund spielt im Garten. |
| Example sentence (English) | no | The dog is playing in the garden. |
| Tags | no | Animals, A1 |
| Deck | yes | German A1 |
| Type | yes | `word` or `sentence` |

### 3.2 Three review directions per card

One card can create up to 3 practice directions. Each can be turned on or off per deck:

1. **Image → German**: show only the image, I answer in German. This is the main one.
2. **English → German**: show the English, I answer in German.
3. **German → English**: show the German, I answer in English.

### 3.3 Sentence cards and cloze

- **Sentence card**: the front shows the image and the English sentence. The back shows the German sentence and plays the audio.
- **Cloze**: a German sentence with one word hidden, with the image as a hint.
  - Example: "Der Hund ___ im Garten." → *spielt*
  - I mark the hidden word when creating the card, like this: `Der Hund {{spielt}} im Garten.`

### 3.4 Review session

- Spaced repetition uses **ts-fsrs**.
- There are 4 buttons: **Again / Hard / Good / Easy**, with keyboard shortcuts 1 / 2 / 3 / 4.
- Daily limits are configurable per deck. Default: 15 new cards and 150 reviews.
- The review page is never empty while cards exist. With nothing due, it starts a practice round of 20 cards ahead of schedule: studied cards that are due soonest first (cards held back by the review limit lead), then new cards past the new limit. Ratings still update FSRS, but the next due date is capped at 10 minutes (Again), 1 hour (Hard), 1 day (Good) or 2 days (Easy). A finished session offers **Practise more**.
- **Show answer** is on the Space key.
- When the answer is shown, the German audio plays automatically. There is also a 🔊 button to replay it.
- **Typing mode** (optional toggle): I type the answer.
  - It accepts small mistakes like `ue` for `ü` or a missing umlaut, but always shows the correct spelling.
  - It highlights wrong letters.
- **Listening mode**: play the German audio, and I type what I heard.

### 3.5 German gender colors

Show the German word in color everywhere, by gender:
- **der** = blue
- **die** = red
- **das** = green

### 3.6 Adding images

- Upload a file
- Paste from the clipboard (Ctrl+V)
- Drag and drop
- Resize images before saving (max about 600px wide, JPEG/WebP) to keep the database small

### 3.7 Quick add

A small "+" button that is always visible.
- I type only English and German and save in a few seconds.
- These cards get the tag `incomplete`, so I can add the image and the rest later.

### 3.8 Import / export

- Import from CSV with columns: `english, german, gender, plural, example_de, example_en, tags, deck`
- Export all data (cards, images, history, tasks) to one JSON backup file, and import it back

---

## 4. Daily goals

- A **topic** has a name, a color and a daily goal in minutes. Examples:
  - German: 150 min (2h30)
  - AI: 120 min (2h)
- Goals can be **different per weekday**. For example, Saturday could have 180 min of German and 60 min of AI.
- The **Today** page shows each topic with:
  - a progress bar
  - time done
  - time remaining, for example "German: 1h10 done · 1h20 left"
- When a topic reaches its goal, show it as completed ✅.

---

## 5. Focus timer

- Pick a topic, then press **Start**.
- Modes:
  - **Countdown**: defaults to the time remaining for that topic today, and can be edited
  - **Pomodoro**: 25 min focus and 5 min break, configurable
  - **Free**: counts up until I stop it
- Buttons: Start / Pause / Stop
- When I stop it or the time ends, save a **session** with topic, start, end and minutes. The minutes are subtracted from that topic's remaining time today.
- **Important**: save the start timestamp, not a ticking counter. The timer must stay correct if I close the tab, refresh, or my phone sleeps. When I come back, a running timer continues.
- Play a sound when time ends.
- After a session, offer an optional one-line note: "What did I learn?"
- Flashcard review time can count automatically toward the German topic (setting on/off).
- If a session crosses midnight, split it between the two days.

---

## 6. History and progress

- **Calendar heatmap** (like GitHub's), where darker days mean more study time. It can be filtered by topic.
- **Day view**: for each topic, show the goal, the time done, and ✅ goal hit or ❌ missed, plus that day's session notes.
- **Streaks**: current and longest streak of hitting the goal, per topic.
- **Charts**: hours per topic per week and per month.
- **Weekly review**: "This week: 18h studied of 31h goal (58%)".
- **Flashcard stats**:
  - total cards
  - cards learned
  - cards due today
  - retention %
  - reviews per day

---

## 7. To-do board (like Jira)

- Columns: **Backlog (later) → To Do → Doing → Done**
- Drag and drop between columns, and reorder inside a column
- **Task fields**:
  - title
  - description
  - topic (optional)
  - priority (High / Medium / Low, shown with a color)
  - due date (optional)
  - created date
- Filters: by topic, by priority, and **Today** (due today or overdue)
- Overdue tasks are shown in red

---

## 8. Extra features

- **Word of the day** on the home page: a random learned card with its image
- **Reminders** (PWA notifications), for example "You still have 1h of German today"
- **Settings**:
  - daily card limits
  - Pomodoro lengths
  - German voice choice
  - theme
  - backup/restore

---

## 9. Data model (suggestion)

```ts
type Topic = {
  id: string;
  name: string;
  color: string;
  goalMinutes: { mon: number; tue: number; wed: number; thu: number; fri: number; sat: number; sun: number };
  archived: boolean;
};

type Session = {
  id: string;
  topicId: string;
  start: number;   // timestamp ms
  end: number;     // timestamp ms
  minutes: number;
  date: string;    // "YYYY-MM-DD" local date
  note?: string;
  source: "timer" | "flashcards";
};

type ActiveTimer = {
  topicId: string;
  mode: "countdown" | "pomodoro" | "free";
  startedAt: number;
  pausedAt?: number;
  pausedTotalMs: number;
  targetMinutes?: number;
};

type Deck = {
  id: string;
  name: string;
  newPerDay: number;
  reviewsPerDay: number;
  directions: { imageToDe: boolean; enToDe: boolean; deToEn: boolean };
};

type Card = {
  id: string;
  deckId: string;
  type: "word" | "sentence" | "cloze";
  english: string;
  german: string;              // cloze uses {{word}} markers
  gender?: "der" | "die" | "das";
  plural?: string;
  verbForms?: string;
  exampleDe?: string;
  exampleEn?: string;
  imageId?: string;            // points to Image table
  tags: string[];
  createdAt: number;
};

// One review state per card + direction (FSRS data from ts-fsrs)
type CardReview = {
  id: string;                  // `${cardId}:${direction}`
  cardId: string;
  direction: "imageToDe" | "enToDe" | "deToEn" | "cloze";
  fsrs: unknown;               // ts-fsrs Card object
  due: number;
};

type ReviewLog = {
  id: string;
  reviewId: string;
  rating: 1 | 2 | 3 | 4;
  reviewedAt: number;
  durationMs: number;
};

type Image = { id: string; blob: Blob; width: number; height: number };

type Task = {
  id: string;
  title: string;
  description?: string;
  topicId?: string;
  priority: "high" | "medium" | "low";
  status: "backlog" | "todo" | "doing" | "done";
  order: number;
  dueDate?: string;            // "YYYY-MM-DD"
  createdAt: number;
  doneAt?: number;
};
```

---

## 10. Pages / navigation

1. **Today** (home):
   - goal progress per topic
   - start-timer buttons
   - cards due today
   - today's tasks
   - word of the day
2. **Focus timer**: the timer page
3. **Flashcards**:
   - card library
   - review session
   - add/edit card
   - search
4. **History**:
   - week calendar
   - heatmap
   - streaks
   - goal results
   - weekly review
5. **Board**: the to-do kanban
6. **Settings**

On the computer, navigation is a sidebar on the left. On the phone, the sidebar becomes a bottom tab bar with the same 5 items: Today, Focus timer, Flashcards, History, Board.

---

## 11. Design

**Mockups:** the `design/` folder has a screenshot (`.png`) and an HTML page (`.html`) for each screen: `today`, `timer`, `flashcards` and `history`. Match them closely. The HTML files show the exact colors, sizes and spacing; read them for details. The numbers and words in them are example data only.

The style is **calm and soft**: an off-white sidebar, a white main area, white rounded cards with thin borders, soft sage-green highlights, and dark pill-shaped main buttons. There is a lot of white space, no heavy shadows and no gradients. It should feel quiet and focused.

### 11.1 Colors (use as CSS variables / Tailwind theme)

| Token | Hex | Used for |
|---|---|---|
| `bg-sidebar` | `#F7F7F4` | sidebar and app background |
| `bg-main` | `#FFFFFF` | main content area, cards |
| `bg-soft` | `#FAFAF8` | soft page background (History page, timer card) |
| `bg-field` | `#F4F4F0` | select rows, tab group background, empty progress bars |
| `ink` | `#1C211E` | main text |
| `ink-2` | `#3A3F3B` | inactive sidebar links |
| `muted` | `#70746F` | secondary text, labels |
| `line` | `#ECECE6` | borders and dividers |
| `line-strong` | `#DCDCD5` | outline buttons, selected card border |
| `button-dark` | `#22302A` | primary buttons (dark green-black) |
| `button-soft` | `#FAF5DC` | soft secondary button (for example "Add card") |
| `sage` | `#E3ECDA` | German blocks, success chips, badges |
| `sage-border` | `#CFDDC2` | border of sage blocks |
| `sage-ink` | `#3E5A33` | text on sage, links |
| `sage-bar` | `#8FB27C` | German progress bar |
| `sage-dot` | `#5F8F4E` | German topic dot |
| `blue-soft` | `#E4E9F2` | AI blocks and chips |
| `blue-border` | `#CBD5E8` | border of AI blocks |
| `blue-ink` | `#34477A` | text on AI blocks |
| `blue-bar` | `#9EADD0` | AI progress bar |
| `blue-dot` | `#6D7FAE` | AI topic dot |
| `red-soft` | `#F7E5E0` | "High" priority chip background |
| `red-ink` | `#9A3A2A` | "High" chip text, "Due today" |
| `clock-red` | `#C8412F` | the timer's second hand, logo dot |

Each topic gets its own color set (dot, bar, soft block, border, text). New topics pick from a small list of soft colors in the same style.

**German gender colors** are used on every German noun, for the article only:

| Article | Hex |
|---|---|
| **der** | `#2D5EA8` (blue) |
| **die** | `#B5422E` (red) |
| **das** | `#3E7B3B` (green) |

### 11.2 Font

- **Geist** (Google Fonts), weights 400 / 500 / 600, with fallback `'Helvetica Neue', system-ui, sans-serif`.
- Use `font-variant-numeric: tabular-nums` on all times and numbers.

| Use | Size | Weight |
|---|---|---|
| Page title ("Today") | 28px, letter-spacing -0.02em | 600 |
| Big stat numbers ("2:05 h", "38") | 40px, letter-spacing -0.03em | 400 |
| Timer countdown ("24:13") | 72px, letter-spacing -0.04em | 400 |
| Card / section title | 17px | 600 |
| Body | 14px | 400 |
| Small labels, chips | 12–13px | 500 |

### 11.3 Shapes and spacing

- **Card radius**: 16px for sections, 14px for flashcards, 10px for images inside cards and for sidebar items.
- **Buttons**:
  - pill-shaped (`border-radius: 999px`)
  - 40px tall
  - main action dark (`button-dark` with white text)
  - secondary outlined (`line-strong` border) or soft yellow (`button-soft`)
- **Chips**: pill-shaped, 12px text, soft background with dark text in the same color family. Examples: "70 min" on sage, "High" on red-soft.
- **Borders**: 1px `line`. Shadows are almost invisible; use them only on the active sidebar item and on popup panels.
- **Main area padding**: 32px top, 36px sides. Use 20–24px gaps between cards.
- Use flex/grid with `gap`, not margins.

### 11.4 Layout

- **Sidebar** (240px wide, `bg-sidebar`), from top to bottom:
  1. **Logo**: a small dark circle with clock hands and a red center dot, plus "Lernzeit" in 20px / 600.
  2. **Search box**: white, rounded 10px, with placeholder "Search cards, tasks".
  3. **"Workspace" label**, then the nav links: Today, Focus timer, Flashcards (with a sage count badge for cards due, for example "38"), History, Board.
     - The active link is a white rounded box with a thin border and tiny shadow, in bold.
  4. **"Goals today"**: each topic with a colored dot and "1:10 of 2:30 h".
  5. **Bottom**: the daily plan summary ("4:30 h goal per day") and a settings button.
- **Main area**: white, with a 1px left border. Page title and subtitle on the left, action buttons on the right.
- **Phone**: the sidebar is hidden and a bottom tab bar is shown. Cards stack in one column.

### 11.5 Page details

**Today**
1. **Header**:
   - title "Today"
   - subtitle with the date and time left, for example "Wednesday, 14 October · 2:25 h left to reach your goals"
   - buttons: "Add card" (soft yellow) and "Start timer" (dark)
2. **Stats strip**: one bordered card split into 3 parts by thin vertical lines:
   - "2:05 h / studied of 4:30 h today"
   - "38 / cards due · 12 new"
   - "12 days / German streak"
3. **Left column**:
   - **Daily goals** card: one row per topic with the dot, name, "1:10 of 2:30 h", a rounded progress bar, "1:20 left", and an outlined "Start" button.
   - **Today's sessions** card: time range, topic, note, and a duration chip.
4. **Right column**:
   - **Word of the day** card: image on a soft background, the colored article plus the word, English and plural, and an example sentence.
   - **To do today** card: checkbox, title, and a priority chip.

**Focus timer**
1. **Header**: title "Focus timer", subtitle like "German · countdown · started 14:02", and a sage "Running" chip.
2. **Left card**: the **clock**.
   - It looks like a station clock: white face, light-grey minute ticks, dark hour bars, a dark minute hand, and a thin red second hand with a round red disk near the tip.
   - A soft sage arc shows the time remaining in the session.
   - Below the clock: the big countdown "24:13", "left in this 45 min session", and two buttons: "Pause" (outlined) and "Stop and save" (dark).
3. **Right panel "Session"**, styled like a popup:
   - rows on `bg-field`, each with a label on the left and the value plus a chevron on the right: Topic, Mode, Length, At the end (sound)
   - a footer "After this session · German 0:35 h left today"
4. **Under it**: a "What did you learn?" text box.

**Flashcards** (library)
1. **Header**:
   - title "Flashcards"
   - subtitle "214 cards in 3 decks · 38 due today"
   - buttons: "Add card" (soft yellow) and "Review 38 cards" (dark)
2. **Tabs**: a pill tab group on `bg-field` with counts: All 214, German A1 120, German A2 64, AI terms 30. On the right, a sort menu, "Due first".
3. **Grid of cards**, about 170px minimum each:
   - the image on a soft colored background (radius 10px)
   - the German word with its colored article
   - "apple · noun"
   - a bottom row with the due status ("Due today" in red-ink, otherwise for example "in 3 days") and a deck chip
4. **Selected card**: soft background and a `line-strong` border.
5. **Detail panel on the right**:
   - a big image
   - the word with its colored article, plus an audio button
   - a details list: English, Plural, Example, Translation, Next review, Reviews (for example "6 · 83% correct")
   - "Practice directions" chips: active ones in sage, inactive in grey
   - buttons: "Edit card" (outlined) and "Review now" (dark)
6. **Sidebar**: on this page, the "Goals today" section is replaced by "Decks", each with its card count and due count.

**Review session** (Phase 2), in the same style:
- a big centered card with the image on top and the answer below, as described in section 3
- 4 rating buttons at the bottom: Again / Hard / Good / Easy, each with its next interval
- Good is the dark button

**History**
1. **Header**: title "History", subtitle "Week of 5 October", and a week picker button.
2. **Stats strip**: "22.5 hrs studied this week", "71% of the 31.5 h weekly goal", "3 of 7 days with every goal hit".
3. **"Your week" calendar**:
   - one column per day, with the day name, total hours, and ✓ if all goals were hit
   - a time axis from 08:00 to 20:00 with faint hour lines
   - each study session is a rounded block in its topic color, showing the topic and duration
4. **Bottom left: "Daily goals"**: one row per topic, for example "German, 2:30 h every day", with a chip like "Hit 3 of 7".
5. **Bottom right: "Last 16 weeks" heatmap**: square cells, 13px with radius 3px, on a 5-step sage scale from `#F1F1EC` to `#4E7A3E`, with the streak shown.

**Board** (Phase 3), in the same style:
- columns are `bg-soft` panels with rounded corners
- tasks are white cards with a title, a topic dot, a priority chip and the due date
- overdue dates are shown in red-ink

### 11.6 Images and icons

- **Card images** sit on soft pastel backgrounds:
  - `#F6E6E1`
  - `#E3ECDA`
  - `#FAF1D6`
  - `#E4E9F2`
  - `#EFE7DE`
  - `#F4E4EA`
  - `#F1F1EC`

  Show the image with `object-fit: contain` (or `cover` for photos), with rounded 10px corners.
- **Icons**: thin outline icons, 1.7px stroke, 18px size. Use **lucide-react**.
- No emoji in the UI.

---

## 12. Build phases

**Phase 1: Goals, timer, history**
- Topics with daily goals per weekday
- The Today page
- The timer with all 3 modes, safe after refresh or closing the tab
- Sessions
- History (heatmap, day view, streaks)
- Seed two example topics: German (150 min) and AI (120 min)

**Phase 2: Flashcards**
- Decks and cards with English, German, image and gender colors
- The 3 review directions
- ts-fsrs scheduling
- Review screen with audio
- Typing mode
- CSV import

**Phase 3: To-do board**
- Kanban with drag and drop
- Priorities, due dates and filters

**Phase 4: Extras**
- Sentence and cloze cards
- Listening mode
- Flashcard stats
- PWA install and reminders
- JSON backup/restore

### Done means
- Every feature works on phone and computer screens
- Data survives page refresh and closing the browser
- No console errors
- After each phase, give me a short "how to run" and "what's new" summary
