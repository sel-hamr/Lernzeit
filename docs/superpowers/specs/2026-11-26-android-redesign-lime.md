# Android app redesign "Lime": design

Date: 2026-11-26. Status: direction A (Lime) picked by the owner from the mockups
(`.superpowers/brainstorm/1151-1795719375/content/directions.html`). Reference feel: the Dribbble shot
"Banking Mobile App" (soft grey canvas, big rounded white cards, one bright accent, black pill buttons,
big confident numbers). The web app is not touched.

## Goal

The Android app should look designed rather than generic, move well, get the details right, and be ready
to ship. That means every screen in the new style, the missing stage 3d screens (Stories, Grammar,
Questions, Docs, Board), and no rough edges.

## Visual system

- **Colours (light):**
  - canvas `#F2F2F4`, cards `#FFFFFF`, raised fields `#F6F6F8`
  - ink `#16181A`, ink2 `#3B3F44`, muted `#8A8F96`, line `#E7E7EB`
  - accent lime `#D4F24A`, accentSoft `#EEF8C8`, accentInk `#4E6110`, onAccent `#16181A`
  - primary buttons `#16181A` with white text
  - danger `#E5484D`, with soft `#FDECEC`
  - German articles: der `#2D5EA8`, die `#C2410C`, das `#2F7D4F` (the existing hues, tuned for the new canvas)
- **Colours (dark):**
  - canvas `#0E0F11`, cards `#1A1C1F`, fields `#232529`
  - ink `#F2F3F5`, muted `#8D9299`, line `#2A2D31`
  - the accent stays lime; primary buttons turn lime with dark text
- **Type:** Geist.
  - Hero numbers 40/600 with tight letter spacing.
  - Screen titles 28/600; section titles 17/600; body 15/400; captions 13/500 muted.
  - Numbers are always tabular.
- **Shape:** cards radius 28, inner blocks 20, rows 16, pills 999.
- **Spacing and depth:**
  - 20 px page gutter, 12 px between cards.
  - Soft shadow on light cards only: y 8, blur 24, about 6 % black. No borders on cards.
- **Icons:** lucide at 1.8 px stroke. Round 44 px icon buttons on white. No emoji in the UI chrome.
- **Tab bar:**
  - Floating, white, radius 28, inset 12 px from the screen edges, above the safe area.
  - Shows Today, Cards, Stories and Timer.
  - The active tab is an accentSoft pill holding the icon and label; inactive tabs show the icon only.

## Motion and feel

- **Library:** react-native-reanimated (springs on the UI thread) and react-native-gesture-handler.
- **Haptics:** expo-haptics, with a light tap on rating, tab change and toggle, and success on finishing a goal.
- **Entering a screen:** cards fade and rise 12 px, 40 ms apart, with a spring.
- **Progress:** bars and rings animate from 0 to their value on mount and on change.
- **Numbers:** counters roll (animated text) when they change.
- **Press:** every tappable card and button scales to 0.97 on press with a spring. No ripple.
- **Tab bar:** the active pill slides between tabs.
- **Deck carousel:** horizontal snap with a peek of the next card; the active card is full size and the others are at 0.94.
- **Flashcard:**
  - Tap to flip (rotateY), or swipe the card.
  - Right means Good, left means Again, and up means Easy. Down is not used.
  - The card tilts with the drag, and a tint and label ("Good", "Again") fade in.
  - Past the threshold it flies off and the next card springs up from the stack behind.
  - Below the threshold it springs back.
- **Sheets:** bottom sheets that slide up with a spring, can be dragged down to close, and sit on a dimmed backdrop.
- **Accessibility:** the system "remove animations" setting turns all of this into simple fades. Every control has an accessibility label, and touch targets are at least 44 px.

## Screens (all existing behaviour kept, only restyled, unless noted)

1. **Today:**
   - Greeting header ("Guten Morgen" / "Guten Tag" / "Guten Abend" by hour, then the account's first name or nothing), the date, and Search and Menu buttons.
   - A hero card with time studied of the goal, a big number, an animated bar and a "Start studying" pill that opens the timer.
   - A "Your decks" carousel (accent card first; card count; Practise chip).
   - Daily goals as grouped rows with mini bars and a Done badge.
   - Today's sessions and the Word of the day card.
2. **Cards:**
   - A deck selector pill that opens a sheet.
   - A search field, and a card list with rounded rows, an image thumbnail and coloured articles.
   - A floating "+" button, Practise and Import.
3. **Practice:**
   - As in the mockup: an X button, a segmented progress bar, "n done · m left", the swipe/flip card with a stack edge, and four rating tiles with intervals.
   - Undo, typing and listening modes, and speed in a ⋯ sheet.
   - At the end, a "Session done" screen with a summary and a confetti-free success animation (a check that draws itself).
4. **Card editor:** a big image area (camera or gallery), fields in white rounded groups, and a save pill.
5. **Timer:**
   - A large animated progress ring, a big tabular time and a topic chip.
   - Start, Pause and Stop pills, and the pending-note flow.
6. **History:** a summary hero, an animated heatmap, and a session list grouped by day.
7. **Settings:** grouped white sections (iOS-like rows with chevrons and switches); Account, Sync and Danger zone.
8. **Sign-in and welcome:** a canvas with a large title, a white form card and a black pill; the welcome flow pages slide with a dot indicator.
9. **Menu:** a bottom sheet with large rows (icon, title, chevron) for Grammar, Questions, Docs, History, Board and Settings, plus the sync status row.
10. **New in stage 3d:** feature parity with the web, using the same core logic and synced tables.
    - **Stories:** a list with a cover tile, a reader with tap-a-word translation from cards if one exists, and listening via expo-speech.
    - **Grammar:** a topic list and a topic page with sections and examples.
    - **Questions:** a list and a practice view with a show-answer step.
    - **Docs:** a list and a reader (markdown rendered to native text styles).
    - **Board:** columns as a horizontal snap list, task cards, and a create/edit sheet.
    - For each of these, the builder checks what the web feature does (`src/features/<name>`) and matches it.
    - Editing that the web offers is included where it is practical on a phone. Where it isn't, the builder says so in the ledger.

## Production readiness

- No dev-only text, placeholder screens or "Coming soon" left.
- Empty, loading, offline and error states are designed for every list.
- Keyboard handling: forms scroll above the keyboard.
- Android back works everywhere: it closes sheets first.
- Release build:
  - It is signed (plan 3a task 8; the owner must approve the keystore and the downloads).
  - Version code and name come from one place.
  - The app icon and splash use the lime style.
- Tests:
  - The existing Jest suites stay green.
  - New pure helpers (greeting, swipe-to-rating mapping, carousel order, the stage 3d view models) get unit tests.
- A device check on the emulator covers every screen in light and dark.

## Left to the builder

Exact component split, spring constants (start from damping 18, stiffness 220), and the shadow values per
platform.
