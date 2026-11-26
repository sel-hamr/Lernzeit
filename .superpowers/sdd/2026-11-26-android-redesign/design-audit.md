# Android "Lime" design audit

Date: 2026-11-26. Scope: every screen in `mobile/` plus the shared kit (`theme.ts`, `ui.tsx`, `motion/`, `components/`).
Method: code review against the spec (`docs/superpowers/specs/2026-11-26-android-redesign-lime.md`), reasoning
about the rendered result at 360 to 412 dp in light and dark. No device or emulator was used, so every
"looks" claim here comes from measuring the code.

The direction stays as approved: soft grey canvas, white radius-28 cards, one lime accent, black pills, big
tabular Geist numbers, the floating tab bar, springs and haptics. This pass fixes craft inside it.

Status: **Fixed** = done in the "Mobile: design polish pass" commit. **Left** = not done, with the reason.

## High

| # | Screen | Problem | Fix | Status |
|---|---|---|---|---|
| H1 | Timer | The two large pills share one row. At 360 dp each is about 136 dp wide, but "Stop and save" needs about 168 dp (text 108, icon 20, padding 40), so it is cut to "Stop and sa…". The same happens to "End pomodoro", "Skip break" and "Start round 2", and still at 412 dp. | Stack the pair at full width: the secondary action on top, the primary under it. | Fixed |
| H2 | History, dark | The week's day bars fill with `inverse` (#2A2D31) on a `track` of the same #2A2D31, so in dark mode every bar that isn't lime is invisible. | A new `meter` token for neutral fills (ink in light, muted grey in dark), used by the day bars. | Fixed |
| H3 | Practice history, Today | Hero numbers such as "1 h 05 min" sit at 40 px in half-width tiles (about 114 dp inside), so they wrap or clip. The 26 px "practised" tile on Today breaks the same way. | `RollingNumber` gets `numberOfLines` and `adjustsFontSizeToFit`. The tiles use a new `type.figure` size (28) on one line that shrinks to fit. | Fixed |
| H4 | Card editor | A validation error ("English and German are both needed") is drawn after the last panel, far below the fold, while Save is pinned in the footer. Tapping Save seems to do nothing. | Show the error in the pinned footer, above the buttons. | Fixed |
| H5 | Practice, Today, card detail, word sheet | Long German compounds ("Geschwindigkeitsbegrenzung") at 28 to 32 px are wider than the card, and Android breaks them at any letter with no hyphen. In the Cards list a long German line wraps without limit. | `GermanLine`, the cloze sentence and the prompt and answer titles turn on Android hyphenation (`android_hyphenationFrequency="full"`) with a balanced line break. List rows are limited to 2 lines. | Fixed |
| H6 | Practice history, CSV import, Search, History, Cards, Settings data | Plurals were hard-coded: "1 cards" in the practice rows, "Import 1 cards", "look through 1 cards", "All goals hit on 1 of 1 days", the deck pill's label, and the backup and restore messages. | Use core's `count()` everywhere. | Fixed |

## Medium

| # | Screen | Problem | Fix | Status |
|---|---|---|---|---|
| M1 | Today hero | The label "Studied today" sits over "studied of 3:00 h today", which says the same thing twice. With no goals it reads "studied of 0:00 h today". | The line under the number reads "of 3:00 h goal", and only shows when there is a goal. The badge already says "No goals today". | Fixed |
| M2 | Today | Lime is everywhere at once: the avatar, the hero badge, both stat-tile icons, the bar, the first deck, the Done badges and the tab pill. The hero loses its focus. | The stat-tile icons go neutral (a raised tile with an ink2 icon). The hero badge stays neutral until every goal is reached, then turns lime. | Fixed |
| M3 | Today, copy | The empty states contradict the app. Topics "Add one in Lernzeit on the web", but Settings has "Add a topic". Decks "Make a deck … in the Cards tab", but decks can only be made on the web. | "Add one in Settings and it shows up here." and "Make a deck on the web, then add cards in the Cards tab." | Fixed |
| M4 | Cards, Docs, Search, Today, Practice | Some taps have no press feedback: the clear-search X (in three places), section-header actions ("See all") and "Show a hint" use the bare RN Pressable. | Use the motion `Pressable` (a scale spring, or a dim with reduce-motion on). | Fixed |
| M5 | Timer, dark | A paused ring uses `lineStrong` (#3A3D42) on the #2A2D31 track, so it almost disappears in dark mode. | A paused ring uses `muted`. | Fixed |
| M6 | Practice, dark | The Good tile is a near-white #F2F3F5 slab on the #0E0F11 canvas, the brightest thing on the screen and a glare. | Good in dark uses `ink2` (#C9CCD1) with dark text. It still leads, with less glare. | Fixed |
| M7 | Motion kit | `AnimatedBar` animates `width`, which runs a layout pass on every frame for every bar (the hero and each goal row on Today). | Fill the full width and slide it in with `translateX` on the UI thread, measuring the track once. The rounded end stays round. | Fixed |
| M8 | Welcome | Android back on page 2 or 3 leaves the app instead of going back a page. | A `BackHandler` steps back a page while page > 0. | Fixed |
| M9 | Today stats, copy | The stat-tile labels were lowercase with a middle dot: "flashcards practised · 12 cards" and "streak". | Sentence case: "12 cards practised", "German streak", or "Streak". | Fixed |
| M10 | Type scale | One-off figure sizes (24 and 26) on Practice done, Today, Questions and Grammar, and Geist family names hard-coded as strings in six places. | Add `type.figure` (28/34, tabular) and use `fonts.*` everywhere. | Fixed |
| M11 | Icon buttons | The icon size followed the button size (`size × 0.43`), so icons ranged from 14 to 19 px. | 20 px in 44 px buttons and 18 px in smaller ones, all at stroke 1.8. | Fixed |

## Low

| # | Screen | Problem | Fix | Status |
|---|---|---|---|---|
| L1 | Settings sections | The footnote under a section was inset 8 px, but its header 4 px, so there were two left edges. | Both at 4 px. | Fixed |
| L2 | Card detail | The empty-state title "This card is gone." ends with a period. | "This card is gone". | Fixed |
| L3 | Practice done | The caption "12 reviewed, 10 correct." ends with a period. | No period. | Fixed |
| L4 | Search | Result rows used 48 px thumbnails and no chevron. Cards rows use 56 px with a chevron, for the same object. | 56 px with radius 14, a chevron, and German limited to 2 lines. | Fixed |
| L5 | Stories | The level label on the cover is 11 px, below the 12 px floor. | 12 px. | Fixed |
| L6 | Welcome | The "Another topic" field is 52 px tall but its Add button 48 px, so their edges don't line up. | Add is 52 px. | Fixed |
| L7 | Timer, copy | "It is saved with the session." | "Saved with the session". | Fixed |
| L8 | History, copy | Lowercase meta: the detail "this week · streak" and "best 3". | "Week and streak" and "Best 3". | Fixed |
| L9 | Theme | `sizes.button` says 52, but the md pill is 48. | The doc comment states the real sizes (sm 40, md 48, lg 56). | Fixed |
| L10 | Menu sheet | Empty style objects. | Removed. | Fixed |
| L11 | Tab bar | The sliding pill animates `left` and `width`, and the tabs animate `flexGrow`, which is a layout pass per frame for about 300 ms on each tab change. | Leave it for now. It is the signature motion, only five views lay out, and a transform rewrite would change how it feels. Check it on a device in R4. | Left |
| L12 | History | The day bars animate `height`. | Leave it: seven small views, and `scaleY` would squash the rounded tops. Check it on a device. | Left |
| L13 | Page screens | `Screen` spaces its blocks 16 px apart, while the tab pages use the spec's 12 px. | Leave it: Screen's blocks are sections (a header plus a list), and the extra 4 px separates them. | Left |
| L14 | Cards | The filter chips plus the sort chip wrap onto two lines at 360 dp. | Leave it: wrapping is tidy and keeps every filter visible. A horizontal scroller would hide the sort. | Left |

## Checked and fine

- Safe areas and the status bar: the style follows the scheme, sheets are translucent, and the tab bar sits above the inset.
- Touch targets: every IconButton under 44 px gets a hitSlop up to 44, chips are 36 px plus a 4 px slop, and rows are at least 60 px.
- Reduce motion: every animation in `motion/`, the tab bar, the sheets, the swipe card and the heatmap checks `useReducedMotion`.
- Hidden gestures all have a visible alternative: the flashcard swipe (the rating tiles and the hint line), holding a board card (Move in the task sheet) and dragging a sheet down (a tap on the backdrop, or Android back).
- Copy uses "Practise" for the verb everywhere and "Practice" only as a noun ("Practice history"). There is no emoji in the chrome.
- Dark mode cards are flat, with depth from surface steps (canvas #0E0F11, card #1A1C1F, raised #232529), not shadows.
