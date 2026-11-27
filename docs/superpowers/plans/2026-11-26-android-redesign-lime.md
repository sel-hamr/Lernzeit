# Android Redesign "Lime" + Stage 3d Implementation Plan

> For agentic workers: one implementer per stage, run in order. No separate review passes (the owner asked
> for that). Each stage ends green and committed. Keep notes in
> `.superpowers/sdd/2026-11-26-android-redesign/progress.md`.

**Goal:** Every screen of the Android app is in the Lime design with springy motion and haptics (spec:
`docs/superpowers/specs/2026-11-26-android-redesign-lime.md`). Stories, Grammar, Questions, Docs and Board
work like the web. The app is ready for the release build.

**Tech:** Expo 58 / RN 0.88 in `mobile/`. Add these with `npx expo install` so the versions match SDK 58:
`react-native-reanimated`, `react-native-worklets` (if reanimated 4 needs it), `react-native-gesture-handler`,
`expo-haptics`. Do the babel/plugin setup that reanimated requires, and wrap the root in
`GestureHandlerRootView`. Jest: use reanimated's jest setup/mock so tests keep passing.

## Global constraints

- Behaviour, data and sync stay exactly as they are. This is a visual and motion change, plus the new stage 3d screens.
- Reuse `@lernzeit/core` logic, and don't duplicate it in screens. Core stays free of DOM and Node.
- Respect reduce-motion (`AccessibilityInfo` / reanimated `useReducedMotion`).
- Every control needs an accessibility label and a touch target of at least 44 px.
- Light and dark mode.
- Repo rules:
  - Keep `npm run typecheck && npm test && npm run lint && npm run build` green, including mobile.
  - Commit on `feat/mobile-cloud` with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Never push, never `git stash`, no Docker, and don't read `../lernzeit-mobile`.
- Files must be UTF-8. Check the touched files with `iconv -f utf-8 -t utf-8` before committing.
- Don't kill other processes. Expo already runs in a terminal tab (port 8081), so don't start a second one.

## Stage R1: design system, motion kit, navigation, Today, Cards, Practice, editor

1. **`mobile/src/theme.ts`:**
   - Lime tokens for light and dark, per the spec.
   - Keep the existing token names working so untouched screens don't break: map old names onto the new values, and add `canvas`, `card`, `accent`, `accentSoft`, `accentInk`, `onAccent`, `primary`, `onPrimary`, `danger` and `dangerSoft`.
   - New radii and type scale, and a `shadow` helper.
2. **`mobile/src/motion/`:**
   - `springs.ts` (presets)
   - `Pressable` (scale 0.97 plus a haptic option)
   - `FadeInUp` stagger wrapper
   - `AnimatedBar`
   - `AnimatedRing` (svg)
   - `RollingNumber`
   - `haptics.ts` (calls are no-ops in tests)
3. **`mobile/src/ui.tsx`:** restyle the primitives (Button as pill variants primary/accent/soft/ghost, Chip, Field, SelectRow, Sheet as a draggable spring bottom sheet with Android back closing it, ToggleRow, Card, Stepper), and add `IconButton`, `SectionHeader`, `GroupedList`/`Row`, `EmptyState` and `Badge`.
4. **Navigation:**
   - A floating tab bar with a sliding accentSoft pill.
   - TopBar becomes the greeting/title header with round Search and Menu buttons.
   - MenuSheet gets large rows.
5. **Today:**
   - Greeting helper `greeting(hour)` with a test.
   - Hero card, deck carousel (snap, scale), goals list, sessions and Word of the day.
6. **Cards tab:** deck pill and sheet, search, rounded rows, a floating "+" button, and empty states.
7. **Practice:**
   - The gesture card, with `ratingForSwipe(dx, dy, thresholds)` and a test.
   - Flip, fly-off, stack and rating tiles with intervals.
   - Undo, typing and listening modes, and the ⋯ sheet.
   - A Session done screen with a check animation.
   - Haptics on rating.
8. **Card editor and CSV import:** restyled.
9. Tests green. Commit "Mobile: Lime design system, motion, Today, Cards and Practice".

## Stage R2: the rest of the existing screens

Restyle Timer (big animated ring, pills), History (hero, heatmap, grouped days), Settings (grouped sections), Sign-in, the welcome/starter flow (paged with dots), the walkthrough, backup/restore/reset and practice history. Remove anything left over from the old look. Then commit.

## Stage R3: stage 3d features (Stories, Grammar, Questions, Docs, Board)

For each feature, read `src/features/<name>` on the web and the matching core modules (`stories`, `reader`, `storyWords`, `grammar`, `conjugation`, `drills`, `questions`, `docs`, `tabs`/board types), then build the phone screens in the Lime style:

- **Stories:** a list with covers, and a reader with word tap → card/translation and expo-speech listening.
  - Generating a new story uses the web's story prompt flow only if the web does it without a server; otherwise show "Create stories on the web or with Claude".
- **Grammar:** a topic list and topic pages, with drills/conjugation practice if the web has them.
- **Questions:** a list and practice.
- **Docs:** a list and a reader (render markdown with a small in-repo renderer: headings, lists, bold/italic, code, links; no new heavy dependency).
- **Board:** columns as a snap list, task cards, a create/edit/move sheet, and delete.
- Replace `mobile/app/more/[id].tsx` placeholders with real routes. Remove `Placeholder` and every "Coming…" text.
- Local writes go through the existing store (outbox, so they sync). Add view-model helpers with tests.
- Then commit.

## Stage R4 (controller)

- Check on the emulator: every screen, light and dark, with swipe/flip and motion.
- Then the signed release APK (plan 3a task 8), after the owner approves the keystore and the downloads.
