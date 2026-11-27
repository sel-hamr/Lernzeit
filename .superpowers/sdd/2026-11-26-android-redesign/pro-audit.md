# Android "Lime": production audit

Date: 2026-11-27. Scope: every screen still on the phone (Today, Cards, Practice, card editor, card detail, CSV
import, Timer, Practice history, Settings, sign-in, Welcome and the walkthrough, Search, the Menu sheet, Stories
list and reader, Grammar, Questions, Docs) plus the shared kit (`theme.ts`, `ui.tsx`, `motion/`, `components/`)
and the app config. The Lime direction is approved and unchanged; this pass is craft, motion and readiness.

Method: a code review against production standards (Revolut/Monzo/Things level), with the contrast ratios worked
out from the palette. The owner checks on a phone over Expo Go; nothing here was seen on a device by the reviewer.

The owner's recent changes are kept: the Menu in the bottom bar and only Search on top, no Board or History, the
lime Practise button on Cards with adding in the ⋯ menu, the Again/Hard/Good/Easy counters, no stat tiles on
Today, and deck cards at 85 % of the width.

Status: **Fixed (motion)**, **Fixed (audit)** and **Fixed (prod)** name the commit that fixes it. **Left** gives the reason.

## High

| # | Where | Problem | Fix | Status |
|---|---|---|---|---|
| H1 | Everywhere, light | `muted` (#8A8F96) is 3.0:1 on the canvas and 3.3:1 on white. Every caption, count line, subtitle, field label and placeholder fails WCAG AA (4.5:1 for 13 to 15 px text). | `muted` becomes #686D75: 4.6:1 on the canvas, 5.2:1 on white, 4.9:1 on raised fields. Dark mode was already fine (6.1:1). | Fixed (audit) |
| H2 | Practice, dark | The Easy tile's interval caption is `accentInk` (#DDF57A) on lime (#D4F24A), about 1.1:1, so it can't be read. | The caption uses `onAccent`, as the label does. | Fixed (audit) |
| H3 | Tab bar | The pill animated `left` and `width`, and each tab animated `flexGrow`: a layout pass on every frame of every tab change (L11 from the first audit). | Transform-only. The pill is always two units wide and moves by `translateX`. Each tab's icon and word sit in a two-unit box moved by `translateX` to the tab's centre (`tabCenter`). Taps land on a still row of slots that is laid out once per change. The look and the spring are the same. | Fixed (motion) |
| H4 | Every sheet | A closed sheet vanished: the Modal cut out with its own fade while the sheet stayed put, so the backdrop and the sheet were out of step. | The sheet springs down to its own height before the Modal unmounts, and the dim follows the sheet's position on both open and close. A drag-close keeps the fling's speed. Touches are off while it leaves. With reduce motion on, the Modal fades. | Fixed (motion) |
| H5 | App root | No error boundary. A render error in release left a blank screen or closed the app. | A root error boundary with a friendly "Something went wrong" screen and Try again (re-mounts the tree). | Fixed (prod) |
| H6 | Walkthrough, Cards | Stale copy after the owner's change. The tour says "Add words with the plus" and the empty Cards page says "Add one", but there is no plus any more: adding lives in the ⋯ menu. | The tour says "Add cards from the ⋯ menu". The empty state says "Add a card or import a CSV from the ⋯ menu." | Fixed (audit) |

## Medium

| # | Where | Problem | Fix | Status |
|---|---|---|---|---|
| M1 | Stack | Every push used the platform default (a fade-through), so a page, a practice round and an editor all opened the same way. | `stackAnimation()`: pages `ios_from_right`, practice rounds and editors (card, story, grammar, doc, CSV import) `slide_from_bottom`, Search and the sign-in switch `fade`. Everything fades with reduce motion on. | Fixed (motion) |
| M2 | Tabs | Changing tab swapped the page in one frame. | A 220 ms cross-fade with a 14 px shift from the side the tab is on (React Navigation's native driver). A plain fade with reduce motion on. | Fixed (motion) |
| M3 | Today, Cards, Stories | On a new phone, during the first sync, the pages said "No decks yet", "No cards yet" and "No stories yet" while the library was still downloading. | `isFirstSync()` (syncing and never synced). While it is true and the list is empty, a shimmer skeleton shaped like the content shows. The reads are local, so it never shows otherwise. | Fixed (motion) |
| M4 | Lists | Added or removed rows popped: Today's goals and sessions, the Docs folders and lists, the Settings topics, the Cards filter chip and Questions sets opening. The Questions chevron snapped. | `GroupedList animate` and `listEnter`/`listExit`/`listLayout` (fade plus a snappy spring), skipped on first show. The Cards list uses `itemLayoutAnimation`, but not while a search is typed. The chevron turns on a spring. | Fixed (motion) |
| M5 | Motion kit | Stray values outside `springs.ts`: the rating tiles' 50/110 ms, the counter bump's 90 ms, the end ring's 900 ms and 150 ms delay, the feedback panel's own spring and the reader header's 180/120 ms. | All of them are named in `springs.ts` (`pressDown`, `pressUp`, `bumpUp`, `sweep`, `fadeOut`, `SWEEP_DELAY_MS`) and the panel uses `springs.sheet`. | Fixed (motion) |
| M6 | Search, Cards, Stories | Long lists were costly. Search gave every result an entrance, even far down. Card and story rows were not memoised and each got a new `onPress` per render. No window tuning, no `removeClippedSubviews`. | Only the first screenful rises in (`FadeInUp still`). Rows are memoised with one `onOpen(id)`, keys are stable functions, and there is `initialNumToRender`, `windowSize` and `removeClippedSubviews` on Android. Rows wrap to two lines, so they have no fixed height and no `getItemLayout`. | Fixed (motion) |
| M7 | Today | The week strip's day bars were the only progress that did not animate. | `GrowBar`: each bar rises from the bottom on a spring, staggered, using `translateY` inside the clipping track so the rounded top stays round (L12 from the first audit, solved without `height`). | Fixed (motion) |
| M8 | Touch targets | Under 44 dp: the Cards "remove filter" chip (32), the reader's speed pill (30 + 4 slop), the Questions Show/Hide pill (40). | `hitSlop` brings each to 44. | Fixed (audit) / (motion) |
| M9 | Font scaling | At 1.5× to 2× system text, the dense chrome breaks: tab-bar words overflow the fixed pill, chip and badge text wraps out of its pill, rating tiles clip their intervals, and the practice counters overflow. | `maxFontSizeMultiplier` 1.3 on buttons, chips, badges, the segmented control, rating tiles, counters and section headers, and 1.2 on the tab bar. Body text still scales freely. | Fixed (prod) |
| M10 | Splash and icon | The splash used #F7F7F4 and #141816, not the canvas (#F2F2F4 and #0E0F11), so the colour jumped when the first screen drew. The adaptive icon background was off-white. | The splash, root background and adaptive icon background use the canvas, with the dark splash on the dark canvas. | Fixed (prod) |
| M11 | Copy | Three names for one action: "Import cards from CSV", "Import a CSV" and "Import CSV" (screen reader). | "Import cards from a CSV" in the menu and for TalkBack. "Import a CSV" stays as the empty-state button. | Fixed (audit) |
| M12 | Practice and round headers | The X button is read as "End", with no object. | "End round". | Fixed (audit) |

## Low

| # | Where | Problem | Fix | Status |
|---|---|---|---|---|
| L1 | Practice | The "3 / 12" position jumped. | It rolls (`RollingNumber`). TalkBack still reads "Card 3 of 12". | Fixed (motion) |
| L2 | Questions | The question count in the hero did not roll. | `RollingNumber`. | Fixed (motion) |
| L3 | Quick add | After Add, the fields clear with nothing else, so it is unclear whether the card went in. | A short "Added «Hund»" line, announced politely to TalkBack. | Fixed (audit) |
| L4 | Settings | No version anywhere, so a bug report can't say which build it came from. | "Lernzeit 1.0.0 (10000)" under the last section. | Fixed (prod) |
| L5 | App code | `console.warn` and `console.error` in four sync and backup failure paths. | Kept: they are real failure diagnostics, not noise, and they show in `adb logcat` for bug reports. There is no `console.log` and no TODO in shipped code. | Checked |
| L6 | Config | `android.edgeToEdgeEnabled`. | SDK 58 makes edge-to-edge mandatory: prebuild warns if the key is present and the config type no longer has it. Leaving it out is what SDK 58 expects, and a comment says so. | Checked |
| L7 | Icon art | The icon and splash mark are still the old blue mark, not the Lime style. | Left: new artwork is the owner's call. The backgrounds already follow the canvas. | Left |
| L8 | Navigation bar | The Android navigation-bar buttons follow the system theme, not a light or dark override picked in Settings. The status bar does follow the in-app theme. | Left: it needs `expo-navigation-bar`, a new native dependency. With gesture navigation (the default) the bar is transparent over the canvas, so it only shows on 3-button phones. | Left |
| L9 | Back gesture | Android's predictive back animation is not on. | Left: it needs a check on a device that every sheet still closes before the page (BackHandler and the Modal's `onRequestClose`). Back already closes sheets first. | Left |
| L10 | Card editor | Leaving with unsaved changes drops them without asking. | Left: a discard prompt is a behaviour change, and this pass keeps behaviour the same. | Left |
| L11 | Stories | The ⋯ menu holds a single item (Add starter stories). | Left: it matches Questions and Docs, and more items come with the web's features. | Left |

## Checked and fine

- **No dead links.** Board and History are gone from the features list, the menu, the walkthrough, Search and Settings. `more/[id]` shows "This page is not here" for an old id. Practice history (a different page) stays in the Cards ⋯ menu.
- **Android back** closes a sheet before the page (every sheet is a Modal with `onRequestClose`). It steps back through Welcome's pages and skips the tour.
- **Status bar** follows the in-app theme (`light` on dark, `dark` on light). The window background behind transitions and the keyboard follows the canvas (`SystemUI.setBackgroundColorAsync`).
- **Safe areas**: the tab bar sits above the inset, and full-screen pages pad the top and their pinned footers the bottom. Sheets are translucent under the status and navigation bars.
- **Keyboard**: every form screen uses `KeyboardAvoidingView` with `keyboardShouldPersistTaps="handled"`. Lists dismiss the keyboard on drag.
- **Long German words** hyphenate on Android in titles and wrap to two lines in rows (the first audit's H5).
- **Reduce motion**: every animation in `motion/`, the tab bar, sheets, stack and tab transitions, the swipe card, skeletons and the week strip checks it, and layout animations follow the system setting.
- **Animations run on the UI thread** (Reanimated shared values, or React Navigation's native driver for tab scenes). After this pass nothing animates a layout property: bars, the pill, the tabs, the week strip and sheets all move by transform.
- **Lime contrast**: ink on lime is 14:1. Tab-bar `accentInk` on `accentSoft` is 6.2:1. `dangerInk` on `dangerSoft` is 4.6:1. In dark mode the lime primary has dark text.
- **Icons**: lucide at stroke 1.8 (2 to 2.4 for small emphasis glyphs). 20 px in 44 px buttons and 18 px in smaller ones.
- **Accessibility**: every IconButton, chip, row and tab has a label and role. Progress bars and rings report their value. Skeletons are read once as "Loading your decks" (or cards, or stories).
