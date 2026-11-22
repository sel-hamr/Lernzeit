# Android App Foundation Implementation Plan (plan 3a of the Android app)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** An installable, release-signed Android APK (Expo / React Native) that signs in to the owner's Lernzeit cloud, keeps an offline copy in SQLite, syncs both ways, has the phone navigation the owner approved (top bar Lernzeit/Search/Menu, bottom tabs Today/Cards/Stories/Timer, a menu sheet) and a working Today screen.

**Architecture:** `mobile/` becomes an Expo SDK 58 workspace that imports `@lernzeit/core` (TS source) through Metro. Data lives in one generic SQLite table that mirrors the cloud's `records` (`tbl, id, data JSON, updatedAt`), plus `outbox` and `meta`. The sync rules move from the web engine into `packages/core` so phone and web share them; each platform keeps a thin engine over its own storage. Screens reuse core logic (goals, time, sessions) and the Lernzeit tokens (SPEC.md §11).

**Tech Stack:** Expo 58 (React Native 0.88), expo-router, expo-sqlite, expo-secure-store, expo-file-system, @expo-google-fonts/geist, react-native-svg, lucide-react-native, Jest via jest-expo; Node 24's `node:sqlite` for storage tests; Android SDK + Gradle (local build), JDK 17.

**Spec:** `docs/superpowers/specs/2026-11-21-mobile-app-and-cloud-design.md` (section "The phone app"); phone layout: `docs/superpowers/specs/2026-11-22-phone-layout-design.md` (the web phone screens are the visual reference).

**Later plans:** 3b Timer, History, Settings, notifications · 3c Flashcards · 3d Stories, Grammar, Questions, Docs, Board · 3e starter/welcome, walkthrough, backup/restore, reminders, Thorsten later.

## Global Constraints

- API base URL: `https://lernzeit.selhamr9.workers.dev` (from app config, overridable for local testing).
- Sign-in: `POST /api/auth/login` with `{ email, password, device: { name } }` → `{ email, token }`; the token goes in `expo-secure-store`, sent as `Authorization: Bearer <token>`; a 401 signs the device out but keeps local data and the outbox (same rule as the web).
- Sync rules are exactly the web's: newest `updatedAt` wins (`>=`), deletes are tombstones, one push = one seq, `(seq,tbl,id)` cursor, push `data.id`/`data.key` equals the change id, refused changes are parked (not dropped) and retried on each app start, a 404 image is skipped and noted, a `409 {resync:true}` pull clears cursor + merged and resyncs, requests time out (30 s JSON, 120 s images).
- Synced tables and kv keys come from `@lernzeit/core/sync` (`SYNC_TABLES`, `SYNCED_KV_KEYS`, incl. `timeZone`); per-device settings never sync.
- The phone writes its IANA time zone to `kv/timeZone` when it differs (like the web).
- Look: SPEC.md §11 tokens (colours, radii, Geist 400/500/600, tabular numbers), lucide icons, no emoji in UI chrome, light and dark. Phone layout matches the approved web phone screens.
- Release APK signed with a keystore stored OUTSIDE the repo; paths and passwords from environment variables; never committed. Version name/code from one place.
- No Docker; don't read `../lernzeit-mobile`. Repo rules: tests, `npm run typecheck && npm test && npm run lint && npm run build` green (the mobile workspace adds its own `test`/`typecheck`), commits on `feat/mobile-cloud` with the Co-Authored-By trailer, never push, never `git stash`.

## Review Focus

1. **Offline at start** with an account: the app opens on local data, no sign-in screen, and catches up when online.
2. **An edit while a push is in flight** stays in the outbox (same monotonic `at` + ack rule as the web).
3. **App killed mid-pull**: the cursor is saved only with an applied page; reopening resumes without loss or duplication.
4. **A pulled change older than a pending local edit** never overwrites it.
5. **Token revoked** (device removed in Settings on the web): the next sync shows the sign-in screen, local data and outbox kept, signing in again pushes them.

---

### Task 1: Shared sync rules in core (web unchanged) + reset/restore time zone

**Files:** Create `packages/core/src/syncRules.ts` (+ test). Modify `src/sync/engine.ts` to use it; `src/data/io.ts` / `src/data/timeZone.ts` (re-record `kv/timeZone` right after a reset or restore — plan-2 follow-up).

**Interfaces (produces):** pure functions extracted from `src/sync/engine.ts` with the same behaviour: `refusal(change, blobSize?)` (client-side limits), `acceptablePulled(change)` (kv only synced keys, id matches data), `pendingNewer(entryAt, change)`, `batchChanges(changes, maxCount, maxBytes)`, `splitOnRefusal(batch)` (the halving), `nextAt(previousAt, now)` (monotonic outbox stamp), `isResync(errorBody)`.

- [ ] Failing tests for each function (values from today's engine tests), then move the logic; `src/sync` tests stay green; reset/restore test asserts `kv/timeZone` is written again. Full check; commit.

### Task 2: The Expo app shell in `mobile/`

**Files:** Create `mobile/` (Expo SDK 58 + expo-router, TypeScript, `app.config.ts` with name "Lernzeit", Android package `com.selhamr.lernzeit`, version from `mobile/package.json`, API URL in `extra`), Metro config for the npm-workspace monorepo so `@lernzeit/core` resolves to TS source, `mobile/src/theme.ts` (SPEC §11 tokens light+dark), Geist via `@expo-google-fonts/geist`, app icon/adaptive icon/splash generated from `public/` PWA assets, Jest (jest-expo) with one smoke test, ESLint coverage. Root `package.json`: add `mobile` to workspaces; `typecheck`/`test` include it.

- [ ] Smoke test renders the root layout; `npx expo export --platform android` (or `expo-doctor`) succeeds; full check; commit.

### Task 3: Local store (SQLite) with live queries

**Files:** Create `mobile/src/store/db.ts` (schema: `records(tbl, id, data TEXT, updated_at, PRIMARY KEY(tbl,id))`, `outbox(tbl, id, at, stuck, PRIMARY KEY(tbl,id))`, `meta(key PRIMARY KEY, value)`, `images(id PRIMARY KEY, path, type)`), `mobile/src/store/adapter.ts` (a tiny SQL interface implemented by expo-sqlite in the app and by `node:sqlite` in tests), `mobile/src/store/library.ts` (typed get/list/put/remove per synced table; every local write records an outbox entry with `nextAt`; `applyRemote` writes without recording), `mobile/src/store/live.ts` (`useLiveQuery(tables, fn)` re-runs on change events for those tables). Also a `LibraryStore` implementation over this store so core actions can run on the phone later.

- [ ] Tests (node:sqlite adapter): put records an outbox entry; two puts keep one entry with the later `at`; applyRemote records nothing; remove makes a tombstone entry; kv only synced keys recorded; live query re-runs on a write to its table and not on others; the core `library.contract.test-utils` suite passes against the phone `LibraryStore`. Commit.

### Task 4: API client, sign-in and secure token

**Files:** Create `mobile/src/api.ts` (fetch with Bearer, timeouts, `SignedOutError`/`OfflineError`/`ApiError`/`ResyncNeededError`), `mobile/src/account.ts` (signIn/signOut/useAccount; device name e.g. "Android · <model>" via expo-device), `mobile/app/sign-in.tsx` (email + password, the Lernzeit look, errors "Wrong email or password" / "Too many attempts…", password never logged or stored).

- [ ] Tests with a mocked fetch: login stores the token in secure store (mocked) and sends Bearer afterwards; 401 → signed out, data kept; timeout → offline. Commit.

### Task 5: The phone sync engine

**Files:** Create `mobile/src/sync/engine.ts` (push outbox in batches with images uploaded first from files, pull pages with images downloaded to `expo-file-system` first, cursor saved with each applied page, resync on 409, park refused changes, retry parked/missing images once per start; single-flight), `mobile/src/sync/triggers.ts` (start, AppState → active, 2 s after a local write, every 60 s while active, NetInfo back online), `mobile/src/sync/status.ts` (`useSyncStatus`). First sign-in on a phone with no local data: pull everything; with local data (rare): reuse the core fold merge like the web.

- [ ] Tests against an in-memory server faithful to the Worker (port `src/test/syncServer.ts` logic or import it if it's platform-free): Review Focus 2, 3, 4, 5; image round trip with files mocked; parked change retried on next start; 409 resync. Commit.

### Task 6: Navigation shell and the menu

**Files:** `mobile/app/(tabs)/_layout.tsx` (bottom tabs: Today, Cards, Stories, Timer — screens for Cards/Stories/Timer are placeholders "Coming in the next update" in the Lernzeit style), a shared top bar (Lernzeit, Search, Menu), `mobile/src/components/MenuSheet.tsx` (Grammar, Questions, Docs, History, Board as placeholders; Settings; sync status row), `mobile/app/settings.tsx` (Account: email, last sync, Sync now, Sign out with the unsynced-changes warning; device list is web-only for now). Features turned off in synced settings are hidden.

- [ ] Tests: tab and menu items follow `phoneTabs`/`menuItems` rules (reuse or port the web helpers into core if they're pure); sign-out warns when the outbox isn't empty. Commit.

### Task 7: Today screen

**Files:** `mobile/app/(tabs)/index.tsx` and components: header ("Today", date, time left), stats strip (studied of goal, cards due/new, streak), Daily goals per topic with progress bars and "x of y h · z left", Today's sessions list, Word of the day (image from local files, coloured article, English, plural, example). All numbers from core (`goals`, `history`, `time`, `srs`) over the local store, live-updating.

- [ ] Tests for any new view-model helpers; snapshot or render tests for empty and filled states. Commit.

### Task 8: Release build and device check

**Files:** `mobile/android` via `npx expo prebuild --platform android` (committed only if the team convention prefers; otherwise generated in CI/local — decide and document), signing config reading `LERNZEIT_KEYSTORE`, `LERNZEIT_KEYSTORE_PASSWORD`, `LERNZEIT_KEY_ALIAS`, `LERNZEIT_KEY_PASSWORD`; `mobile/scripts/build-apk.ts` (prebuild if needed → `gradlew assembleRelease` → copy the APK to `mobile/dist/lernzeit-<version>.apk`); `docs/android.md` (create the keystore with keytool, back it up, build, install with `adb install`, update).

- [ ] Controller: create a keystore outside the repo with the owner's go-ahead, build the release APK, install it on the Pixel_6_Pro emulator, sign in with a local Worker test account (not the owner's password), check Review Focus 1 and 5 by hand, screenshots of sign-in, Today, menu, Settings. Then hand the APK to the owner to install on the phone.
