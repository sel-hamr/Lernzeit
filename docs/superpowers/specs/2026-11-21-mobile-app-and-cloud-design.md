# Lernzeit mobile app and cloud: design

Date: 2026-11-21. Status: draft for approval.

## Intent

The owner wants Lernzeit on an Android phone as a real app (an APK built with React Native) with the same features as the web app, ready for daily use. They also want to use Lernzeit from **Claude on the phone**: Claude mobile must be able to add cards, stories, grammar, questions, tasks, docs and study time with no files and no local program on the phone.

Today all data lives in the browser's IndexedDB, and the MCP server is a local Node program that relays each request to an open browser tab. Claude mobile can only reach a server on the internet, and Android stops background apps, so the data has to live online. The owner chose:

- **One cloud library** shared by the phone app, the web app and Claude.
- **One account**, theirs. Nobody else signs up.
- **Cloudflare + Expo** as the way to build it (see Approaches).

The existing folder `../lernzeit-mobile` is off limits: nothing is read from it or copied out of it.

## Goals

1. An Android app (Expo / React Native, release-signed APK) with every web feature: Today, Focus timer, Flashcards (library, editor, review, quick add, CSV import, practice history), Grammar, Stories (reader, word notes, Write with AI prompt), Questions, Docs, History, Board, Settings (features on/off, topics and goals, levels, voice, backup/restore, reminders, theme), the starter content and a first-launch welcome.
2. The phone app works offline: it reads and writes a local copy and syncs when online.
3. One cloud copy of the data on Cloudflare. The web app signs in and syncs to it too, so a change on any device shows up on the others.
4. A remote MCP server on the same Cloudflare Worker that Claude mobile (and Claude Desktop, Claude Code, claude.ai) can add as a custom connector, with OAuth sign-in. It offers the same tools, prompts and guide as today, working directly on the cloud data.
5. Nothing already in the owner's browser is lost: the first sign-in on the web uploads the existing IndexedDB data.

## Non-goals

- Other users, sign-up pages, password reset by email, teams or sharing.
- iOS builds or app stores. Android APK only. Expo keeps an iOS build possible later.
- A paid sync service (PowerSync, Replicache, Firebase).
- Real-time collaboration. Sync runs on app start, on return to the foreground, after local writes (debounced) and on a pull-to-refresh. Near-real-time is enough.

## Anti-goals (a failure even if it technically works)

- **Losing study data**: cards, FSRS progress, sessions, stories or notes vanishing or rolling back after a sync. Every sync path needs tests for this.
- **A broken timer**: the timer must stay correct across app kill, phone sleep and midnight, exactly like the web rule (timestamps, never a ticking counter).
- **A different-looking app**: the phone app follows the existing calm Lernzeit style (SPEC.md §11 tokens, Geist, lucide icons, gender colours). No restyle.
- **Secrets in the repo or the APK**: no passwords, keystores or tokens committed or bundled.
- **Claude reaching data without sign-in**: every MCP call must carry a valid OAuth token for the owner.

## Constraints

- Hosting: the existing Cloudflare Worker (`wrangler.jsonc`) that serves `dist/` today. Free tier: Workers and D1 (SQLite). No R2, because turning R2 on asks for a payment method.
- Address: the free `workers.dev` address of the Worker (owner's choice). The APK, OAuth and the Claude connector use it; a custom domain later would need a new APK and a reconnect.
- Deploys: Claude creates the D1 database and deploys at the end of each phase, after the owner signs in once with `npx wrangler login`, and says so each time. The owner types the owner password and adds the connector in Claude themselves.
- Build machine: Windows 11 with the Android SDK and Java 17 installed, so the APK is built and signed locally (`expo prebuild` + Gradle). No Expo cloud account needed.
- No Docker (owner preference).
- The web app keeps its stack (React 19, Vite, Dexie, Tailwind) and its look.
- The repo's working rules: tests next to the existing ones, `typecheck + test + lint + build` green, UI checked in a browser or emulator, README and docs updated, work left uncommitted on the feature branch `feat/mobile-cloud` unless the owner asks for commits.

## Approaches considered

All three use Expo for the app with a local SQLite copy.

1. **Cloudflare + Expo (chosen).** One Worker serves the web app, the sync API and the MCP server at `/mcp` with OAuth (`@cloudflare/workers-oauth-provider`). Data and images in D1. Same SQLite engine on the phone and the server; everything in the place the owner already deploys; fits the free tier. Cost: sign-in and sync are our own code.
2. **Supabase + Expo.** Postgres, auth and storage built in, but the MCP server still runs elsewhere with its own OAuth layer, so two services to run, and Postgres on the server against SQLite on the phone means two schemas to keep in step.
3. **A sync engine (PowerSync, Replicache).** Ready-made sync, but one more paid service for a single user. Dropped.

Also rejected: keeping data on the phone and relaying Claude's requests to the open app. Android kills background apps, so Claude would fail whenever Lernzeit is not on screen.

## Design

### Repository layout

One repo, npm workspaces:

| Path | What |
|---|---|
| `src/` | The web app, as today, plus a sync client and a sign-in page |
| `worker/` | The Cloudflare Worker: static assets, auth, sync API, images, MCP + OAuth |
| `mobile/` | The Expo app (the folder exists and is empty) |
| `packages/core/` | Logic shared by all three: types, FSRS scheduling, practice queues, answer checking, German helpers, conjugation, goals and history maths, timer maths, story word coverage, prompts, the MCP tool actions and guide |
| `mcp/` | The old local stdio server and browser bridge, retired (see below) |

Pure modules move from `src/lib` and `src/db/types.ts` into `packages/core` and the web app imports them from there, so the phone, the web and the Worker run the same code. Only browser-free modules move; files that touch the DOM, `speechSynthesis`, workers or IndexedDB stay in `src/`.

### Data model and storage

Every synced record keeps the **same JSON shape it has in Dexie today**, plus three sync fields: `updatedAt` (client ms), `deleted` (tombstone flag) and, on the server, `seq` (server order).

- **D1** holds one generic table: `records(owner, tbl, id, data JSON, updated_at, deleted, seq)`, primary key `(owner, tbl, id)`, index on `(owner, seq)`. One table means schema changes in the app never need a server migration, and sync code is table-agnostic. MCP tools query with `json_extract` where they need a field.
- **Images** live in a second D1 table, `blobs(owner, id, type, bytes BLOB)`. Images are resized to about 600 px (roughly 30–100 KB), well inside D1's row limit and the 5 GB free tier. The `images` record syncs its metadata (id, width, height, type); bytes upload and download separately and lazily through `/api/images/<id>`.
- **Safety net**: D1 Time Travel can restore the database to any minute of the last 7 days (free tier). The deploy docs show the restore command.
- **Phone**: expo-sqlite with the same generic layout, plus a small typed data layer per table that mirrors `src/data/*` (decks, cards, reviews, sessions, stories…) and reactive queries for the screens.
- **Web**: Dexie stays. A sync client records every local write (Dexie table hooks) and runs push/pull.
- **Not synced**: `clips` (speech cache, per device), device-only KV such as the tour state, reminder bookkeeping.
- **Settings are split.** Synced: everything that describes your study (timer defaults, Pomodoro lengths, count-time switches, typing and listening mode, auto-play, levels, features on or off, end sound). Per device: `voiceEngine`, `voiceURI`, `speechRate`, `theme`, `remindersEnabled`, `reminderTimes`. The web keeps them under a device KV key; the phone keeps them in its own store. Reminders are off by default on every device.
- **`activeTimer` is synced**, so a timer started on the web shows and can be stopped on the phone. It records the device that started it (`deviceId`); only that device rings and shows the end notification, the others just show the running timer.

The full list of synced tables: topics, sessions, decks, cards, reviews, reviewLogs, images (metadata), tasks, stories, questions, responses, drillStats, grammarTopics, exerciseStats, practiceRuns, docFolders, docs, and the synced KV keys (settings, activeTimer, starter markers).

### Sync protocol

- `POST /api/sync/push` with changed records `{tbl, id, data, updatedAt, deleted}`. The server keeps a record only if its `updatedAt` is newer than the stored one (last write wins per record; ties go to the later arrival) and gives it the next `seq`.
- `GET /api/sync/pull?since=<seq>` returns records with a higher `seq`, paged. The client applies them under the same newest-wins rule, so a pending local edit is never overwritten by an older server copy.
- Append-only tables (reviewLogs, sessions, responses, practiceRuns) never conflict in practice because ids are unique per write.
- Deletes are tombstones; they are never dropped while a device could still be behind (a cleanup older than 90 days is fine).
- Each device stores its last pulled `seq` and a queue of unpushed changes that survives restarts.
- **First sign-in on a browser merges, never replaces.** The owner may have real data in several browsers today (localhost, the deployed site, the installed PWA). Every browser's first sign-in pushes all its IndexedDB records (images included) and pulls the cloud's; records with the same id keep the newer one. Since each browser installed the starter on its own with random ids, the merge folds duplicates together: decks with the same name become one deck, and cards in it with the same German and English become one card, keeping the copy with more reviews (its review logs and FSRS state follow it, the others' logs are kept and re-pointed). Stories, grammar topics, questions and docs fold by title the same way. A summary shows what was added and folded. This path gets its own tests with two overlapping libraries.
- **Restore backup** replaces the cloud library with the backup on every device, after a confirm that says so. **Reset all data** wipes the cloud library on every device, after a typed confirm. Both run on the server (one call that tombstones or replaces everything) so every device follows on its next pull. Time Travel is the undo.

Known trade-off, accepted for one user: if the same card is reviewed on two offline devices, the later review's FSRS state wins; both review logs are kept.

### Sign-in

- One owner account: email and a password hashed with PBKDF2 (WebCrypto) in D1. It is created once by a setup command (`npm run cloud:owner`) or the first visit while no owner exists; after that, sign-up is closed.
- The web app gets a session cookie (HttpOnly, Secure, SameSite=Lax). When it runs locally (`npm run dev`, `lz`), Vite proxies `/api` to the production Worker, so the browser still talks to its own origin and the cookie works. Local dev and the phone's debug builds use the production cloud, since there is only one library; Worker tests use a local D1. The phone app gets a long-lived device token stored in `expo-secure-store`, revocable from Settings.
- Login attempts are rate-limited per IP.
- The old hardcoded login (`src/features/login/login.ts`) goes away.

### Remote MCP server

- On the same Worker, Streamable HTTP at `https://<worker>/mcp`, wrapped by `@cloudflare/workers-oauth-provider` (dynamic client registration, PKCE). The authorize page asks for the owner's password, then shows what Claude will be allowed to do.
- Tools, prompts and the `lernzeit://guide` resource keep today's names and behaviour, minus `list_browsers` (no browsers to pick any more). The tool actions from `src/bridge/actions.ts` move to `packages/core` against a small store interface, with one implementation over D1 (Worker) and one over Dexie (tests and the web), so the rules (skip duplicate words, create FSRS reviews, tags, delete confirmations) stay identical.
- The server instructions drop "only while Lernzeit is open in the browser".
- Images Claude makes (emoji art today) follow the same rules as now.
- The local stdio server (`mcp/`), the browser bridge (`src/bridge/`), **Settings → AI connection** and the `npm run mcp:setup` flow are retired. Setup becomes: add `https://<worker>/mcp` as a custom connector in Claude (it works for mobile, web, Desktop and Claude Code alike). Docs and the `lz` command are updated to match.

### The phone app

- Expo (current stable SDK at build time), TypeScript, Expo Router, expo-sqlite, expo-secure-store, expo-notifications, expo-speech (Android's German voice), expo-image-picker (camera and gallery), expo-document-picker / expo-sharing (CSV import, backup), react-native-svg for the clock, charts and heatmap, lucide-react-native icons, Geist font.
- Navigation: a bottom tab bar (Today, Timer, Flashcards, History, Board) plus a "More" route for Grammar, Stories, Questions, Docs and Settings, matching SPEC.md §10. Features turned off in Settings disappear as on the web.
- Look: SPEC.md §11 tokens, ported to a React Native theme; light and dark like the web.
- Behaviour matches the web feature by feature, using the shared core. Phone-specific parts:
  - Timer: the state is timestamps; a scheduled local notification with sound fires at the end of a countdown or pomodoro phase even if the app is closed; midnight splitting as on the web.
  - Reminders: local notifications at the reminder times, skipped when the goal is already met.
  - Review: tap and swipe-friendly buttons in place of keyboard shortcuts; typing and listening modes; audio auto-plays with the device voice.
  - Images: camera, gallery and share-sheet in, resized to about 600 px before saving.
  - Stories: Write with AI builds the same prompt and offers "Copy" and "Open in Claude" (share to the Claude app).
  - Tour: a short first-launch walkthrough of the main screens in place of driver.js.
- Release: a signed release APK; the keystore and its passwords live outside the repo (path and passwords from environment variables), with a documented backup step. App version and versionCode come from one place.

### Voice

The phone starts with Android's text-to-speech in German (expo-speech, voice and rate from Settings). The offline Thorsten voice is a later phase on the phone (it needs an on-device ONNX runtime and a 63 MB model). The web keeps both voices as today.

### Testing and checks ("ready for production")

- `packages/core`: unit tests (move the existing `src/lib/*.test.ts` with their modules).
- Worker: tests with `@cloudflare/vitest-pool-workers` for auth, sync (newest wins, tombstones, paging, nothing lost when two devices write, merge with fold), restore and reset, images, each MCP tool and the OAuth flow.
- Web: the existing Vitest suite stays green; new tests for the sync client and first-upload.
- Mobile: Jest (`jest-expo`) for the data layer and sync; screens checked on the Android emulator with screenshots; a final run of the release APK on the emulator.
- End to end: a card added through MCP shows on the web and the phone; a review on the phone updates the web.
- Deploy to the owner's Cloudflare account and connect Claude mobile as a custom connector before calling it done.

### Build order

Each phase ends working and checked before the next starts.

1. **Core package**: move shared logic into `packages/core`; web app unchanged in behaviour, all tests green.
2. **Cloud**: Worker with owner account, sync API, D1 data and images; web sign-in, sync and first-sign-in merge. Deployed.
3. **Remote MCP**: OAuth, all tools on D1, prompts and guide; retire the bridge; connect Claude mobile.
4. **Phone foundation**: Expo app, sign-in, SQLite, sync, tabs, theme, Today, Timer, History, Settings basics, notifications.
5. **Phone flashcards**: library, editor with images, review with all modes, quick add, CSV import, practice history.
6. **Phone reading and practice**: Stories with the reader and word notes, Grammar, Questions, Docs, Board.
7. **Finish**: starter content and welcome, tour, backup/restore, reminders, release signing, docs and README, a full pass on the emulator.
8. **Later**: Thorsten voice on the phone.

## Calls made by the designer (not asked of the owner)

- Cloudflare D1 with one generic records table, rather than one table per type.
- Images in D1, not R2, so no payment method is needed.
- First sign-in merges every browser's data and folds starter duplicates; restore and reset act on the whole cloud library.
- Study settings sync; voice, theme and reminders stay per device; only the device that started a timer rings.
- Local dev proxies `/api` to the production Worker.
- Last write wins per record, by client time.
- The bridge, the local MCP server and the AI connection settings are retired, since every Claude app can use the remote server.
- The web app requires sign-in (it is no longer usable without an account).
- Device voice first on the phone; Thorsten later.
- Expo Router and a bottom tab bar plus "More".
- The APK is built and signed locally.

## Left to the builder

Exact library versions, file and module names inside each package, the reactive-query mechanism on the phone, paging sizes, debounce timings, rate-limit numbers, the shape of the store interface, how the walkthrough looks within the Lernzeit style.
