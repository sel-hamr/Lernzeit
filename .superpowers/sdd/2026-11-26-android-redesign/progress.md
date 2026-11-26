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
