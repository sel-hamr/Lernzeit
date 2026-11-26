# Android redesign "Lime": progress

## Stage R1: design system, motion kit, navigation, Today, Cards, Practice, editor (done)

What was built:

- **Dependencies:**
  - Added with `npx expo install`: `react-native-reanimated` 4.7.1, `react-native-worklets` 0.13.0, `react-native-gesture-handler` 3.3.0 and `expo-haptics`.
  - There's no babel config: babel-preset-expo adds the worklets plugin itself, and it resolves the plugin from `mobile/` first, so its version matches the runtime.
  - The root is wrapped in `GestureHandlerRootView`. Each sheet's Modal gets its own one.
- **Jest:**
  - Uses `resolver: react-native-reanimated/jest/resolver`, `react-native-gesture-handler/jestSetup` and `setUpTests()` (in `test/setupAfterEnv.ts`).
  - `getUIRuntimeHolder` is mocked in `test/setup.ts`, because gesture handler binds to the UI runtime that Jest doesn't have.
- **`src/theme.ts`:**
  - Lime tokens for light and dark: canvas, card, raised, chip, accent, accentSoft, accentInk, onAccent, primary, onPrimary, inverse, danger, dangerSoft and dangerInk.
  - The old names (`sidebar`, `main`, `sage*`, `buttonDark`, `redInk`…) are aliases onto the new values.
  - Radii: card 28, block 20, row 16 and pill. The old radius names map onto these.
  - A type scale with hero 40/600 tabular and body 15.
  - `shadow(scheme)`: boxShadow `0 8 24 rgba(0,0,0,.06)` for cards and `0 12 32 .12` for floating things. Dark mode has no shadows.
- **`src/motion/`:** `springs`, `haptics` (no-ops under Jest), `Pressable` (scale 0.97 plus a haptic option), `FadeInUp` (12 px rise, 40 ms stagger), `AnimatedBar`, `AnimatedRing`, `AnimatedCheck` and `RollingNumber`. With reduce motion on, all of these turn into fades or simply swap.
- **`src/ui.tsx`:**
  - Restyled: pill `Button` (primary, accent, soft, ghost and danger; outline maps to soft), `Chip`, `Field` (with a focus edge), `SelectRow`, `ToggleRow` (lime track and haptic), `Card` and `Stepper`.
  - New: `IconButton`, `Badge`, `OptionRow`, `SectionHeader`, `GroupedList`/`Row`, `Tile` and `EmptyState`.
  - `Sheet`:
    - It springs up and can be dragged down by its handle or title to close.
    - It closes on a backdrop tap and on Android back (`onRequestClose`).
    - It has an optional pinned `footer` and keeps above the keyboard.
- **Navigation:**
  - The floating tab bar is white, radius 28 and inset 12. One spring drives both the sliding accentSoft pill and the tab widths: the active tab is twice as wide and holds the icon and label.
  - The TopBar is on the canvas. On Today it shows the avatar, the greeting by the hour in the synced zone and the date. On the other tabs it shows the page name. Search and Menu are round buttons, and Menu carries the sync dot.
  - The MenuSheet has large rows with tiles and a sync card.
  - `Screen` has a round back button, an optional `right` slot and a pinned `footer`.
- **Today:**
  - A hero card with a rolling number, an animated bar, a goal-status badge and Start studying.
  - Practised and streak tiles.
  - A "Your decks" carousel: snaps, shows a peek, and scales the side cards to 0.94. The first card is lime, then dark, then white. Tapping a card practises that deck.
  - Goals as grouped rows with mini bars and a Done badge. Reaching a goal gives a success haptic.
  - Sessions, and a Word of the day card.
- **Cards:**
  - A deck pill and sheet, a search field with a clear button, filter chips, and a sort chip that opens a sheet.
  - Practise and Add card pills, rounded rows with thumbnails and an Incomplete badge.
  - A lime "+" button for quick add, a ⋯ sheet, and empty states.
- **Practice:**
  - The top row has X, segmented progress (one segment per card up to 24, a bar after that), Undo and ⋯.
  - The `SwipeCard`:
    - Rises from a two-edge stack and flips on rotateY: 90° out, the content swaps, then a spring back from -90°.
    - After the reveal it can be swiped (right Good, left Again, up Easy). It tilts, shows a tint and label, and gives a haptic as it crosses the threshold. It then flies off and the next card springs up, or it springs back.
  - Rating tiles show intervals. Dark mode gives Good its own white tile, so it isn't the same lime as Easy.
  - The ⋯ sheet has toggles for read aloud, typing and listening, plus speed chips and Edit card.
  - Session done: a ring fills, a check draws itself, there are count tiles and a success haptic.
- **Card editor, card detail and CSV import:** restyled with a big picture area, white grouped cards and a pinned Save pill.
- **Smaller changes:**
  - The Timer tab lost its own "Focus timer" title, because the TopBar shows it.
  - The Stories placeholder no longer repeats its title.

Spring constants (`src/motion/springs.ts`):

| Name | damping | stiffness | mass | Used for |
| --- | --- | --- | --- | --- |
| gentle | 18 | 220 | 1 | entrance, bars, rings |
| press | 18 | 420 | 0.6 | scale 0.97 on press |
| snappy | 20 | 300 | 0.8 | tab pill, rolling numbers |
| sheet | 24 | 260 | 1 | bottom sheets |
| card | 16 | 200 | 0.9 | flashcard return, enter, flip |

Timings: fade 180 ms, flip half 130 ms, fly-off 220 ms and check draw 520 ms.

Tests:

- New: `test/redesign.test.ts` covers greeting/hourIn, deckCarousel, ratingForSwipe/flyTarget and the tab pill maths.
- Updated: Today text expectations (the date moved to the header), the `page-title` testID instead of the "Lernzeit" text, and the theme test that now checks the Lime tokens.

Deferred and known:

- Not checked on a device or emulator yet (that is stage R4). The shared Metro on 8081 should be restarted with `--clear` so it picks up the worklets babel plugin. A dev build would need rebuilding for the new native modules (Expo Go SDK 58 already ships them).
- Screens not restyled yet (Timer, History, Settings, Sign-in, Welcome/Tour, backup, practice history) pick up the new primitives and colours through the aliases. Some still set `colors.main`, a white page; that is stage R2.
- The account has no name, only an email, so the greeting has no name. The avatar shows the email's first letter.
- In Practice, a card whose content overflows scrolls inside the card. Then only sideways swipes rate it; the tiles still work.

## Stage R2: Timer, History, Settings, sign-in, welcome and the rest (done)

What was built:

- **Timer:**
  - A white hero card with a state badge, the mode, round and start time, and a 16 px `AnimatedRing` (up to 280 px). The ring shows the share of the phase done, or the share of the current hour for a free timer (`src/timer/ring.ts`, tested). It is lime while running, grey while paused and blue on a break.
  - A big tabular time inside the ring (52 px once it has hours), with the caption under it.
  - A topic chip with the topic's dot opens a topic sheet. Start, Pause/Resume and Stop are large pills with haptics (firm on start, success on stop).
  - A Session card with a segmented Countdown / Pomodoro / Free control and the length row, and a note card. It is keyboard-safe (KeyboardAvoidingView).
  - With no topics, it shows an empty state.
  - The pending-note sheet has a check tile and a pinned Skip / Save note footer.
- **History:**
  - A hero with week arrows (round buttons), a rolling total, an animated bar and a goals badge.
  - Seven day columns that grow on a spring one after another, lime with a check when every goal was hit.
  - Topics as grouped rows: hits, the core note and the streak.
  - The 16-week heatmap is built from Views now, with columns that pop in one after another and an outline on today. It has a Less…Hit legend.
  - New: the week's sessions grouped by day (`src/history/sessionsByDay.ts`, tested), with times, notes and minutes, plus an empty state.
- **Practice history:** two summary tiles (cards, time) and the rounds grouped by day as rows, with an empty state.
- **Settings:**
  - Every group is a `Section` (a new primitive in ui.tsx: a header, a white `GroupedList` and a muted footnote).
  - Rows have chevrons and switches. `SelectRow` gained `inline` (the label left, the value and a chevron right).
  - `ActionRow` in `settings/groups.tsx` is a tile plus a label (Add a topic, Test voice, Export, Restore, Walkthrough).
  - Account (an avatar initial, the email, Sign out) and Sync (a cloud tile tinted by level, the last sync, the status chip, an offline line, stuck changes, the message and Sync now).
  - Your data, then a Danger zone with Delete all data. The reset sheet has a danger block and a pinned footer.
  - The topic and deck sheets have pinned Cancel / Save footers, and their steppers sit in a raised block.
  - The sections enter staggered.
- **Sign-in:** a canvas with the mark in a white tile, a 34 px title, a white form card with focus edges, an eye toggle (an IconButton), the error in a danger block and the black `Button` pill (busy state). Remove-data is a danger pill.
- **Welcome:**
  - Three pages in a paged horizontal scroll: an intro on a lime tile with three points, the topics, and the goal with the German starter.
  - Animated dots stretch with the scroll position.
  - Back, Next and Let's start buttons. Start empty is reachable on every page, and the last page has Get started / Set up and download.
- **Walkthrough:** a white floating card with a lime icon tile per step, step dots, Skip / Next pills, and a staggered entrance per step. Android back skips it (as before).
- **Search:**
  - Now a real search of the cards, through `cardMatches` (`src/cards/search.ts`, tested), which the Cards tab uses too.
  - A pill field that autofocuses, and result rows with thumbnails, the deck and a count.
  - Empty states for nothing typed and for no match.
- **Placeholder** (the menu pages until R3, and Stories) is an `EmptyState` card. Stories gets the page gutter.

Tests:

- New in `test/redesign.test.ts`: `ringProgress`, `sessionsByDay` and `cardMatches`.
- The shell search test now types a query and checks the results and the no-match state.
- Mobile: 20 suites, 190 tests. Root: vitest 651 and worker 195.

Deferred and known:

- Not checked on a device yet (R4).
- The Welcome is an overlay, not a modal, so Android back there still leaves the app as before. Every sheet and the walkthrough close on back.
- The menu pages and Stories are still placeholders (R3).

## Stage R3: Stories, Grammar, Questions, Docs and Board (done)

What was built (each matches its web feature in `src/features/<name>`, logic from core):

- **Shared:**
  - `src/speech.ts` (`useSay`: expo-speech in German at the Settings speed and voice, stopped when the screen closes).
  - `src/study/studyTime.ts`: active reading/practice time saved as sessions, as the web does. The activity rules moved from `src/lib/activity.ts` to core (`@lernzeit/core/activity`); the web imports them from there.
  - `src/components/RoundParts.tsx`: `Segments` (moved out of PracticeScreen), `RoundTop`, `DiffText`, `RoundEmpty`, `RoundDone` (ring and check).
  - `src/components/RuleText.tsx` (core's parseRule/parseInline in native text, tables scroll sideways), `FeatureGate.tsx` (a page turned off in Settings says so, with Open Settings), `src/notice.ts` (Android toast, an alert as fallback; `confirmDelete`).
  - `Screen` gained `scroll={false}` and `onTouchStart`.
  - Starter buttons: `addStarterPart` / `useStarterPart` download the German starter and add the missing stories, questions or topics at the installed levels.
- **Stories** (tab): tiles with a pastel cover (first letter, level), preview, difficulty badge, coverage bar and "x% in your decks". Reader: tap a word for a sheet with the AI note (meaning, why this form, example, tip) and the card (picture, forms, knowledge, Open card), or an add-to-deck form (incomplete + story tags, sentence as example, LEO link). Highlights by knowledge and article colours, per-paragraph and whole-story listening, translation toggle, colour key, Mark as read, reading time. Story editor route with delete. Write with AI: deck/level/length/theme like the web, then the prompt goes out through the share sheet (the web copies it) and the arriving story shows "Read it".
- **Grammar**: course hero (next topic, progress), review card (due count, next due), path/section toggle, rows with a filling ring or a lime check. Topic page: rule, examples to hear, From your cards, exercises with answers, Practise. Round (topic or review): choices (articles in their colours), typed with äöüß, tap the mistake, build from words, card drills (gender, plural, verbs), feedback with letter diff, why and Ask Claude (opens claude.ai), wrong answers requeued, done screen with progress before → after and what to work on. Topic editor with the drill select and exercise syntax check.
- **Questions**: hero with Practise all, set cards (Practise, add, show rows), question sheet editor with delete. Practice: English and hint-word chips, typed answer (kept), Show answer, Skip, comparison with your answer, suggested, earlier answers, tally at the end.
- **Docs**: search, status and tag chips, continue-reading, folders, docs; folder new/rename/move/delete (with counts). Reader with an in-repo Markdown renderer (`src/docs/markdown.ts`: headings, lists with nesting and task boxes, quotes, fences, rules, tables, pictures, bold/italic/strike/code/links; only http(s)/mailto links open; raw HTML stays text), saved reading position, contents sheet, pin, move, share, delete, Mark as read. Editor with write/preview.
- **Board**: four columns in a horizontal snap list with a peek and page dots, filters (all/due today/priority), task cards (topic dot, due line in red when due or overdue, priority badge). Task sheet creates and edits (column, topic, priority, due date chips with ± a day), moves up/down, deletes; holding a card opens a Move sheet.
- Routes: `story/[id]`, `story/edit`, `grammar/[id]`, `grammar/edit`, `grammar/practice`, `questions/practice`, `doc/[id]`, `doc/edit`, `docs/[folder]`; `more/[id]` dispatches Grammar, Questions, Docs and Board. `Placeholder` and every "Coming…" text are gone.
- All writes go through the local library (`library.put/remove/write`), so they reach the outbox and sync.

Tests: `test/features3d.test.ts` (view models, Markdown, data rules, starter parts, study time) and `test/screens3d.test.tsx` (reader word sheet and add, read count, grammar round, question practice, doc reader, board add/move, turned-off page). Mobile: 22 suites, 217 tests. Root: vitest 651, worker 195.

Phone alternatives and deferred:

- No clipboard package: the AI story prompt and a doc's Markdown go through the share sheet instead of Copy.
- Board tasks move with the Move sheet and Move up/down, not by dragging as on the web.
- Docs: pasting or dropping pictures into a doc is web-only; pictures already in a doc show. Code blocks have no syntax colours and no Copy button (they are selectable). Heading links (#anchors) stay text.
- Theme ideas: the featured ones only; the web's "More themes" dialog is not on the phone.
- The reader's Highlights/Translation toggles are not remembered between visits (the web keeps them in browser storage).
- Not checked on a device yet (R4).

## Stage R5: Today, Cards and Story reader redesign (after the phone test)

The owner's phone screenshots showed a patchy reader, a thin Today and a crowded Cards header. What changed:

- **Floating tab bar:** the bar now floats over the pages (absolute, transparent around the white pill). `useTabBarSpace()` in `BottomBar.tsx` gives every tab page its bottom padding (bar + safe area + air); Today, Cards, Stories and Timer use it, and the Cards add button sits above the bar.
- **Story reader:**
  - Words are laid out one by one (`src/stories/flow.ts`, `flowUnits`: a word keeps its punctuation, lines break only at spaces), so each word can carry a clean 2 px underline (`WordMark`): lime while learning, sand when new, dotted grey when not in a deck, nothing when known. No word backgrounds. Article colours stay on nouns. Type 19/28 with 3 px between lines, 24 px between paragraphs, the page white and full width (24 px gutter).
  - The per-paragraph speakers and the header speaker are gone. A dark mini player sticks above the safe area: play/pause, paragraph before/next, speed (1×, 1.25×, 0.75× of the Settings speed), "Paragraph 2 of 6". The paragraph being read sits on a lime wash and scrolls into view; holding a paragraph reads from there. Tapping a word's sound in its sheet pauses the player.
  - The coverage card: "Your words", a big "45%" with "known or learning · 94% in your decks", a segmented rounded bar, a 2 x 2 legend with tabular numbers and the advice ("Study its words first") as a full-width soft pill. Once it scrolls away the header shows the title and a compact bar with "45% known".
  - Highlights and the key ("What the lines mean") stay in the ⋯ sheet.
- **Today:**
  - Hero: a 52 px time with a smaller "h", "of 7:00 h goal", a ring with today's percent (a check when done), a friendly line (`heroLine`), a Monday–Sunday strip from the history (`weekStrip`: bars against each day's goal tick, today lime, hit days olive) with the week's total, a streak chip, and Start studying. The "x h left" badge is gone (the line says it).
  - Three stat tiles (`statTiles`): cards practised, practice minutes ("<1" under a minute), streak days, with plural-correct units and tinted icon chips (lime, blue, clay).
  - Deck carousel: compact 150 px cards, the initial on a soft tile instead of the clipped watermark, a round play button, the name on two lines and "16 cards · Practised yesterday" (`lastPractisedByDeck`, `practisedLabel`). Only the first card is lime.
- **Cards:**
  - A deck card (name, chevron, "16 cards" under it) with the Practise pill inside it; the badge that floated on the pill's edge is gone.
  - Search is a pill with the sort as an icon button on its right (a lime dot when not Newest); the sort shows in the count line ("3 of 16 cards · newest first").
  - All / Incomplete / No picture is a `Segmented` control (new in `ui.tsx`: a sliding white pill), never wrapping.
  - The Add card button is gone; the lime + is the one add. The full editor is in the ⋯ menu ("New card with every field") and linked from Quick add.
  - Rows form one white grouped list with hairlines (52 px thumbnails, ripple instead of a shrink), "Incomplete" inline in sand, and the letter placeholders are darker (0.42).
- **Elsewhere:** `ChipRow` (new in `ui.tsx`: one sideways-scrolling line with edge fades) for the Board filters and the Docs status/tag chips; Grammar's Your path / By section is a `Segmented`.

Tests: new pure helpers in `test/redesign.test.ts` (week strip, stat tiles, hero line, last practised, practised label, word flow, bar height); the Today tests follow the new hero and tiles; a reader test drives the mini player. Mobile: 22 suites, 227 tests. Root: vitest 651, worker 195.

Left: not seen on a device after this pass (the owner tests live over Expo). Dotted underlines use a 2 px dotted box, as Android draws dotted borders only on whole boxes.
