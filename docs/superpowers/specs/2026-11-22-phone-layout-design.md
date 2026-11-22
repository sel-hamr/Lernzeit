# Phone layout fixes: design

Date: 2026-11-22. Status: approved by the owner (with the nav correction below).

## Why

On the owner's phone the web app is hard to use: Settings is cut off on the right, the bottom bar has 8 crowded tabs, the deck picker is a desktop pill row, and the practice screen hides the answer behind the rating buttons. These must be fixed before the Android app copies the same screens (plan 3).

## Scope

Phone layout only: viewports under 768 px (`md` breakpoint). The desktop layout does not change. Keep the Lernzeit visual style (SPEC.md §11; no restyle).

## Design (owner-approved)

1. **Top bar (phone):** the Lernzeit name/logo on the left; on the right only **Search** and a **Menu** button (☰). Nothing else in the top bar (the voice choice, Docs and Settings icons move into the menu).
2. **Menu (phone):** opens as a sheet. It lists every page that is not in the bottom bar (Grammar, Q&A, History, Board, Docs) plus Settings, the voice choice, and the sync status row. Pages turned off in Settings → Features are hidden. The current page is marked.
3. **Bottom bar (phone):** exactly 4 tabs: **Today, Cards, Stories, Timer** (designer's pick; the owner did not object). No "More" button. If one of these four is turned off in Features, the bar shows the remaining ones (the turned-off page is not replaced).
4. **Deck picker (phone, Flashcards):** one select-style button showing the current deck and its card count, e.g. `All decks · 898 ▾`. Tapping it opens the existing deck search menu (the "More" deck menu) as a sheet. Desktop keeps the pill tabs.
5. **Practice screen (phone):**
   - The bottom tab bar is hidden while practising.
   - The top row fits on one line: ✕ (end), progress `12 / 1159`, and the mute, typing and listening toggles. The Again/Hard/Good/Easy counters are not shown on phones.
   - After **Show answer**, the picture shrinks and the "What is this in German?" / "Show a hint" lines are hidden, so the answer is visible without scrolling.
   - The rating buttons sit at the bottom (respecting the safe area) and the page reserves their height, so no content hides behind them. **Undo** sits just above the buttons.
   - The speed buttons (0.6×–1.2×) and the edit pencil move into a small `⋯` menu on the card.
6. **No sideways overflow:** Settings cards (and any grid/flex item) can shrink below their content's min width; long commands and URLs wrap or scroll inside their own box. A test checks every route for horizontal overflow at 375 px.

## Approaches

Only one sensible way: responsive changes inside the existing components (Tailwind `md:` variants, the existing Dialog/menu components). A separate phone UI would duplicate screens that plan 3 replaces anyway.

## Left to the builder

Exact component structure, sheet animation, icon choices from lucide-react, test approach for the overflow check (jsdom can't measure layout — a browser check by the controller is the real proof; a unit test can at least assert the classes/structure).
