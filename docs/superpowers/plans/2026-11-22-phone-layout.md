# Phone Layout Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the web app clean on phones (under 768 px): 4-tab bottom bar, a top bar with only name/Search/Menu, a menu sheet for everything else, a select-style deck picker, a practice screen whose answer is never hidden, and no sideways overflow.

**Architecture:** Responsive changes in the existing React components (Tailwind `md:` variants and the existing UI primitives in `src/components/ui/*`). Desktop (≥ 768 px) unchanged.

**Tech Stack:** React 19, Tailwind 4, lucide-react, Vitest (+ fake-indexeddb), existing feature plugins (`src/app/plugins.ts`).

**Spec:** `docs/superpowers/specs/2026-11-22-phone-layout-design.md`

## Global Constraints

- Phone = below the `md` breakpoint (768 px). Nothing changes at `md` and up.
- Keep the Lernzeit visual style (SPEC.md §11 tokens, lucide icons 1.7 px stroke, no emoji in UI, no restyle). Reuse `src/components/ui/*`.
- Bottom bar tabs: Today, Cards (Flashcards), Stories, Timer — in that order; features turned off in Settings → Features are left out, not replaced.
- Top bar on phones: Lernzeit name/logo, Search, Menu — nothing else.
- No horizontal overflow on any route at 375 px wide.
- Repo rules: `npm run typecheck && npm test && npm run lint && npm run build` green; commit per task on `feat/mobile-cloud` with the Co-Authored-By trailer; never push; never `git stash`.

## Review Focus

1. A feature turned off (e.g. Stories) disappears from the bottom bar and the menu; the bar shows 3 tabs.
2. The menu sheet closes on navigation, Escape and backdrop tap, and is keyboard reachable.
3. After **Show answer** on a 375×667 screen, the German answer and the rating buttons are both fully visible without scrolling, for an image card, an English→German card and a cloze card.
4. Typing mode and listening mode still work on phones (input visible above the keyboard area, not under the rating bar).
5. Desktop at 1280 px looks exactly as before (sidebar, pill deck tabs, practice header with A/H/G/E counts).

---

### Task 1: Navigation (top bar, menu sheet, 4-tab bottom bar) and overflow

**Files:**
- Modify: `src/app/layout/AppShell.tsx` (phone top bar and bottom bar), the component that renders the phone header today (find it from AppShell), `src/app/plugins.ts` only if a helper for "phone tabs" belongs there
- Create: `src/app/layout/PhoneMenu.tsx` (the sheet)
- Modify: `src/features/settings/SettingsPage.tsx` and/or `src/features/settings/Group.tsx` / `ClaudeGroup.tsx` (overflow: grid items `min-w-0`, long code wraps/scrolls in its own box)
- Test: `src/app/layout/nav.test.ts` (pure helper tests), plus a test for the phone-tab selection

**Interfaces:**
- Produces: `phoneTabs(features: FeaturePlugin[]): FeaturePlugin[]` (the four bottom tabs, in order, minus turned-off ones) and `menuItems(features: FeaturePlugin[]): FeaturePlugin[]` (every enabled page not in `phoneTabs`, plus nothing else — Settings/voice/sync are rendered as fixed rows in the sheet). Plugin ids: check `src/app/plugins.ts` / each `src/features/*/plugin.ts` for the real ids.

- [ ] **Step 1:** Failing tests for `phoneTabs`/`menuItems` (all on; Stories off → 3 tabs and Stories not in menu; Grammar off → not in menu).
- [ ] **Step 2:** Implement the helpers, the phone top bar (name, Search, Menu), the menu sheet (pages, Settings, voice choice, sync status row; closes on navigate/Escape/backdrop), the 4-tab bottom bar. Remove the voice/Docs/Settings icons from the phone top bar.
- [ ] **Step 3:** Fix the Settings overflow (and any shared Group/grid that can't shrink). Long commands (`claude mcp add …`) wrap with `break-all` or scroll inside a `max-w-full overflow-x-auto` box.
- [ ] **Step 4:** Full check; commit. (The controller verifies the layout in a browser at 375 px and 1280 px.)

---

### Task 2: Deck picker and practice screen on phones

**Files:**
- Modify: `src/features/flashcards/DeckTabs.tsx` / `LibraryPage.tsx` (phone: one select-style button opening the existing deck search menu `DeckMenu`/`DeckPicker` as a sheet; desktop: pill tabs as today), `src/features/flashcards/ReviewPage.tsx` (phone layout as in the spec section 5), `src/app/layout/AppShell.tsx` (hide the bottom bar on the practice route on phones)
- Test: add to existing flashcard tests where logic changes (e.g. a pure helper for the deck button label `deckButtonLabel(deck | 'all', count)`), keep all existing tests green

**Interfaces:**
- Consumes: `phoneTabs` from Task 1 (the bottom bar component), existing `DeckMenu`/`DeckPicker` props.

- [ ] **Step 1:** Failing tests for any new pure helpers (deck button label; which header controls render on phones if extracted).
- [ ] **Step 2:** Deck picker button + sheet on phones.
- [ ] **Step 3:** Practice screen on phones: one-line top row (✕, `n / total`, mute, typing, listening; no A/H/G/E counts); picture shrinks and prompt/hint lines hide after Show answer; rating bar fixed at the bottom with safe-area padding and reserved space; Undo above it; speed + edit in a `⋯` menu on the card; bottom tab bar hidden while practising. Typing/listening inputs stay visible above the rating bar.
- [ ] **Step 4:** Full check; commit. (The controller verifies at 375×667 and 1280×800: image, English→German and cloze cards, typing and listening modes.)
