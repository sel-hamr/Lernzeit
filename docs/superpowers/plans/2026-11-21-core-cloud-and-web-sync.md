# Core, Cloud and Web Sync Implementation Plan (plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Lernzeit's browser-free logic into a shared package, stand up one Cloudflare Worker with an owner account, a sync API and image storage on D1, and make the web app sign in, merge its existing data into the cloud and stay in sync.

**Architecture:** `packages/core` holds types and pure logic used by the web app now and by the Worker and the phone app later. The Worker (Hono, D1) serves `dist/` as before and adds `/api/*`. The web app keeps Dexie; a DBCore middleware records every local write in an `outbox` table, and a sync engine pushes the outbox and pulls server changes by cursor. Newest `updatedAt` wins per record, everywhere.

**Tech Stack:** TypeScript 6, React 19, Vite 8, Dexie 4, Vitest 5 (web, core), Cloudflare Workers + D1, `wrangler@4`, `hono@4`, `@cloudflare/vitest-pool-workers@0.23` with `vitest@4` (worker workspace only).

**Spec:** `docs/superpowers/specs/2026-11-21-mobile-app-and-cloud-design.md`. Plans 2 (remote MCP) and 3 (phone app) are written after this one lands.

## Global Constraints

- No Docker. No R2. Images live in D1.
- Address: the Worker's free `workers.dev` address. Deploys run after the owner has signed in with `npx wrangler login`; say so each time you deploy.
- Never commit or bundle secrets. The owner's password is typed by the owner into `npm run cloud:owner`; only its hash reaches D1.
- PBKDF2-SHA256 with **100,000** iterations (the Workers WebCrypto maximum), 16-byte salt, 32-byte hash, base64.
- Session cookie `lz_session`: HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age 34,560,000 (400 days).
- Newest wins: an incoming record replaces the stored one when `incoming.updatedAt >= stored.updatedAt` (ties go to the later arrival).
- Deletes are tombstones (`deleted = 1`, `data = NULL`); never hard-delete a `records` row.
- Synced Dexie tables: topics, sessions, decks, cards, reviews, reviewLogs, images (metadata only), tasks, stories, questions, responses, drillStats, grammarTopics, exerciseStats, practiceRuns, docFolders, docs, and kv rows with keys `settings`, `activeTimer`, `seeded`, `starterConjugations`, `starterGrammar`, `starterOffer`. Never synced: `clips`, every other kv key, `outbox`, `meta`.
- Per-device settings: `voiceEngine`, `voiceURI`, `speechRate`, `theme`, `remindersEnabled`, `reminderTimes`.
- Keep the Lernzeit look (SPEC.md §11): new screens reuse `src/components/ui/*`.
- Repo rules: follow existing patterns and comment style; `npm run typecheck`, `npm test`, `npm run lint`, `npm run build` all green at the end of every task; check UI in the browser on the user's running dev server (:5173, see memory) or a separate port with its own dep cache; update README and docs. Work stays **uncommitted** on `feat/mobile-cloud` unless the owner asks for commits, so the "Commit" steps below are checkpoints: run the full check instead of committing.

## Review Focus

1. **Two browsers with overlapping libraries** (same starter ids, different German topic ids, one practised more): after both sign in, one German topic, no duplicate decks or cards, and the more-practised review state survives. Test owned by Task 2 and Task 8.
2. **An edit made while a push is in flight** must stay in the outbox and go up next time, not be dropped when the ack arrives. Test owned by Task 7.
3. **A pulled change for a record with a newer pending local edit** must not overwrite it. Test owned by Task 7.
4. **Offline at start** (no network, previously signed in): the app opens on local data, no sign-in wall, sync resumes when online. Test owned by Task 8.
5. **A timer started on another device**: this device shows it but never completes its phase or rings, and stopping it here saves sessions with the same ids the owner device would. Test owned by Task 6.

---

### Task 1: Shared core package

Move browser-free modules out of `src/` into `packages/core`, with no behaviour change.

**Files:**
- Create: `packages/core/package.json` (`"name": "@lernzeit/core"`, `"type": "module"`, `"private": true`, `"exports": { "./*": "./src/*.ts" }`, dependency `ts-fsrs` moved here at the same range), `packages/core/tsconfig.json` (same strictness as `tsconfig.app.json`, `lib: ["ES2023"]`, no DOM).
- Move (`git mv`, with each one's `*.test.ts`): `src/lib/{answer,conjugation,deckPick,docs,drills,german,goals,grammar,history,picked,practice,questions,queue,reader,sessions,srs,storyPrompt,storyThemes,storyWords,tabs,text,time,timer,tour}.ts` → `packages/core/src/`; `src/db/types.ts` → `packages/core/src/types.ts`; `src/bridge/protocol.ts` → `packages/core/src/protocol.ts`.
- Stay in `src/lib`: activity, browser, colors, image, install, notify, sound, speech, thorsten, thorsten.worker.
- Modify: every importer (`src/**`, `mcp/src/**`, `bin/**`, `scripts/**`): `@/lib/<moved>` → `@lernzeit/core/<moved>`, `@/db/types` → `@lernzeit/core/types`, `@/bridge/protocol` and `./protocol` (from `src/bridge`) → `@lernzeit/core/protocol`; inside core, `@/db/types` → `./types`.
- Modify: root `package.json` (`workspaces: ["mcp", "packages/core", "worker"]` — add `worker` in Task 3; `typecheck` adds `npm run typecheck -w @lernzeit/core`), `vite.config.ts` (`test.include` adds `packages/core/src/**/*.test.ts`), `tsconfig.app.json` only if resolution needs it, `eslint.config.js` (core files get no browser globals).

**Interfaces:**
- Produces: `@lernzeit/core/<module>` with exactly the exports the moved files had. Later tasks import `@lernzeit/core/types`, `@lernzeit/core/time`, `@lernzeit/core/timer`.

- [ ] **Step 1:** Create the package files and run `npm install` so `node_modules/@lernzeit/core` links to `packages/core`.
- [ ] **Step 2:** `git mv` the files listed above.
- [ ] **Step 3:** Rewrite imports with one scripted search-and-replace, then `grep -rn "@/lib/\(answer\|conjugation\|...\)\|@/db/types\|bridge/protocol" src mcp bin scripts` must return nothing for moved modules.
- [ ] **Step 4:** Run `npm run typecheck && npm test && npm run lint && npm run build`. Expected: all pass; the test count equals the count before the move.
- [ ] **Step 5:** Check one page per feature in the browser (Today, Flashcards review, Stories reader, Grammar, History): no console errors.

---

### Task 2: Sync definitions and the first-sign-in fold

Pure logic shared by the Worker, the web app and later the phone.

**Files:**
- Create: `packages/core/src/sync.ts`, `packages/core/src/fold.ts`
- Test: `packages/core/src/sync.test.ts`, `packages/core/src/fold.test.ts`

**Interfaces:**
- Produces (`sync.ts`):
  - `SYNC_TABLES` (the 18 names in Global Constraints, `kv` last) and `type SyncTable`.
  - `SYNCED_KV_KEYS` (the 6 keys) and `DEVICE_SETTING_KEYS` (the 6 settings, `satisfies readonly (keyof Settings)[]`).
  - `interface SyncChange { tbl: SyncTable; id: string; data: unknown | null; updatedAt: number; deleted: boolean }`, `interface PulledChange extends SyncChange { seq: number }`.
  - `interface PullResponse { changes: PulledChange[]; cursor: string; more: boolean }`, `interface PushResponse { applied: number }`.
  - Limits: `MAX_PUSH_CHANGES = 500`, `MAX_PUSH_BYTES = 1_500_000`, `MAX_PULL_CHANGES = 500`, `MAX_RECORD_BYTES = 1_000_000`, `MAX_IMAGE_BYTES = 1_500_000`, `MAX_ID_LENGTH = 200`.
  - `recordId(tbl: SyncTable, row: object): string` (the `key` for kv, else `id`), `isSynced(tbl: string, id: string): boolean` (kv only for `SYNCED_KV_KEYS`), `wins(incoming: { updatedAt: number }, current?: { updatedAt: number }): boolean`.
  - `interface ImageMeta { id: string; width: number; height: number; fit: ImageFit; type: string }`, `imageMeta(img: StoredImage): ImageMeta`.
  - `splitSettings(s: Partial<Settings>): { shared: Partial<Settings>; device: Partial<Settings> }`.
- Produces (`fold.ts`):
  - `type Library = Partial<Record<SyncTable, Record<string, unknown>[]>>` (images as `ImageMeta`).
  - `uploadTime(tbl: SyncTable, row: Record<string, unknown>): number` — the time a never-synced record counts as changed: `updatedAt` if present; reviews: `fsrs.last_review` as ms (0 if never reviewed); reviewLogs: `reviewedAt`; sessions: `end`; drillStats and exerciseStats: `lastAt`; responses: `at`; practiceRuns: `end`; otherwise `createdAt`; else 0.
  - `interface FoldResult { upload: Library; dropLocal: { tbl: SyncTable; id: string }[]; summary: { added: Partial<Record<SyncTable, number>>; folded: Partial<Record<SyncTable, number>> } }`
  - `foldLibraries(local: Library, cloud: Library): FoldResult`

**Fold rules** (records with equal ids are not folded; newest-wins via `uploadTime` settles them on the server):
1. topics: same trimmed, lower-cased `name` → local id maps to the cloud id.
2. decks: same name (after rule 1 repoints `topicId`) with different ids → map.
3. cards: in the same (mapped) deck, same trimmed lower-cased `german` and `english` → map to the cloud card. Per direction, the review row with more review logs (count logs by `reviewId` on each side) is kept, ties to cloud; a kept local review is re-keyed to `${cloudCardId}:${direction}`. All review logs are kept and repointed (`reviewId`, `cardId`, `deckId`). drillStats re-keyed to `${cloudCardId}:${drill}`; on a collision the one with more `right + wrong` is kept.
4. stories: same `title` and `text`; questions: same `set` and `question`; grammarTopics: same `title` and `rule`; docFolders: same mapped `parentId` and `name`; docs: same mapped `folderId`, `title` and `body` → the local copy is dropped. Repoint responses.questionId; local exerciseStats of a dropped grammar topic are kept only if their exercise id exists in the cloud topic's `exercises`, repointed to the cloud topic id.
5. Repoint through the topic map: sessions, decks, stories, tasks `topicId`. Repoint `practiceRuns.decks` keys through the deck map.
6. kv: a local synced key that exists in the cloud is dropped (cloud wins).
7. `upload` = every local record not dropped, rewritten by the maps. `dropLocal` = every local id that was mapped away or dropped. `summary.added` counts upload records whose id is not in the cloud; `summary.folded` counts mapped or dropped records, per table.

- [ ] **Step 1: Write the failing tests**

`sync.test.ts`: `isSynced('kv','tour') === false`, `isSynced('kv','settings') === true`, `isSynced('cards','x') === true`, `isSynced('clips','x') === false`; `wins({updatedAt: 5}, {updatedAt: 5}) === true`, `wins({updatedAt: 4}, {updatedAt: 5}) === false`, `wins({updatedAt: 1}) === true`; `splitSettings({ theme: 'dark', pomodoroFocus: 30 })` → `{ shared: { pomodoroFocus: 30 }, device: { theme: 'dark' } }`; `recordId('kv', { key: 'settings', value: {} }) === 'settings'`.

`fold.test.ts` with a fixture builder for two libraries:
- `test('two German topics become one')`: local topic `{id:'tL', name:'German'}`, cloud `{id:'tC', name:' german '}` → no topic in `upload`, `dropLocal` has `topics/tL`, a local session with `topicId:'tL'` uploads with `topicId:'tC'`.
- `test('same starter ids are not folded')`: identical deck and card ids on both sides → `summary.folded` is empty, the card is in `upload` unchanged.
- `test('duplicate card keeps the review with more logs')`: local card `cL` with 3 logs for `enToDe`, cloud `cC` with 1 → `upload.reviews` has `cC:enToDe` with the local fsrs, all 4 logs end up pointing at `cC` (3 uploaded, repointed).
- `test('cloud review wins a tie')`: 1 log each → no `cC:enToDe` in `upload`, the local log still uploads repointed.
- `test('identical starter story is dropped, different text is kept')`.
- `test('kv settings: cloud wins')`.
- `test('uploadTime')`: review with `fsrs.last_review` ISO string → its ms; review never reviewed → 0; doc → `updatedAt`.

- [ ] **Step 2:** Run `npx vitest run packages/core/src/sync.test.ts packages/core/src/fold.test.ts`. Expected: FAIL, modules missing.
- [ ] **Step 3:** Implement `sync.ts` and `fold.ts` with the signatures above. Check the `StoredFsrs` shape in `types.ts` for how `last_review` is stored and parse it accordingly.
- [ ] **Step 4:** Run the same command. Expected: PASS. Then run the full check.

---

### Task 3: Worker skeleton, D1 schema and test harness

**Files:**
- Create: `worker/package.json` (`"name": "lernzeit-worker"`, deps `hono@^4.13`, devDeps `wrangler@^4.166`, `@cloudflare/vitest-pool-workers@^0.23`, `vitest@^4.1`, `@cloudflare/workers-types`; scripts `test: vitest run`, `typecheck: tsc`), `worker/tsconfig.json`, `worker/vitest.config.ts` (`defineWorkersConfig`, wrangler config `worker/wrangler.test.jsonc`, migrations applied in a setup file with `readD1Migrations` / `applyD1Migrations`), `worker/wrangler.test.jsonc` (same `main` and D1 binding, no assets), `worker/src/index.ts`, `worker/src/env.ts`, `worker/migrations/0001_init.sql`, `worker/test/setup.ts`, `worker/test/health.test.ts`.
- Modify: `wrangler.jsonc` (add `"main": "worker/src/index.ts"`, `"d1_databases": [{ "binding": "DB", "database_name": "lernzeit", "database_id": "<set in Task 10>", "migrations_dir": "worker/migrations" }]`, and under `assets`: `"binding": "ASSETS"`, `"run_worker_first": ["/api/*"]`; keep `not_found_handling`). Root `package.json`: add `worker` to workspaces, `typecheck` and `test` run the worker workspace too. `eslint.config.js`: `worker/**` gets `globals.serviceworker`.

**Interfaces:**
- Produces: `interface Env { DB: D1Database; ASSETS: Fetcher }`; `app` (a `Hono<{ Bindings: Env; Variables: { ownerId: string } }>`) exported from `worker/src/index.ts` with `export default app`; requests outside `/api` go to `c.env.ASSETS.fetch(c.req.raw)`.

`0001_init.sql`:

```sql
CREATE TABLE owner (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL, iterations INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE auth_tokens (token_hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('web', 'device')), name TEXT NOT NULL, created_at INTEGER NOT NULL, last_used_at INTEGER NOT NULL);
CREATE TABLE login_attempts (ip TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX login_attempts_ip ON login_attempts (ip, at);
CREATE TABLE counters (owner TEXT PRIMARY KEY, seq INTEGER NOT NULL);
CREATE TABLE records (owner TEXT NOT NULL, tbl TEXT NOT NULL, id TEXT NOT NULL, data TEXT, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, seq INTEGER NOT NULL, PRIMARY KEY (owner, tbl, id));
CREATE INDEX records_seq ON records (owner, seq, tbl, id);
CREATE TABLE blobs (owner TEXT NOT NULL, id TEXT NOT NULL, type TEXT NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY (owner, id));
```

- [ ] **Step 1:** Write `health.test.ts`: `SELF.fetch('https://x/api/health')` → 200 `{ ok: true }`; a request to `/api/nope` → 404 JSON `{ error: 'Not found' }`.
- [ ] **Step 2:** Run `npm test -w lernzeit-worker`. Expected: FAIL.
- [ ] **Step 3:** Implement the app, routes and harness.
- [ ] **Step 4:** Run again. Expected: PASS. Run the full root check.

---

### Task 4: Owner account and sign-in

**Files:**
- Create: `worker/src/password.ts`, `worker/src/auth.ts`, `scripts/cloud-owner.ts`, `worker/test/auth.test.ts`, `scripts/cloud-owner.test.ts`
- Modify: `worker/src/index.ts` (mount routes), root `package.json` (`"cloud:owner": "node scripts/cloud-owner.ts"`)

**Interfaces:**
- Produces (`password.ts`, WebCrypto only so it runs in Workers and Node 22+): `hashPassword(password: string, saltB64?: string, iterations = 100_000): Promise<{ hash: string; salt: string; iterations: number }>`, `verifyPassword(password: string, stored: { hash: string; salt: string; iterations: number }): Promise<boolean>` (constant-time compare).
- Produces (`auth.ts`): `requireOwner` Hono middleware — reads the `lz_session` cookie or `Authorization: Bearer <token>`, looks up `sha256(token)` in `auth_tokens`, sets `ownerId`, updates `last_used_at` at most once per hour, else 401 `{ error: 'Signed out' }`.
- Routes:
  - `GET /api/auth/status` → `{ signedIn: boolean, email?: string }`
  - `POST /api/auth/login` `{ email, password, device?: { name: string } }` → web: sets cookie, `{ email }`; with `device`: `{ email, token }` (no cookie). Wrong email or password → 401 `{ error: 'Wrong email or password' }`. More than 10 failed attempts from one IP (`CF-Connecting-IP`) in 15 minutes → 429 `{ error: 'Too many attempts. Try again in 15 minutes.' }`; successful login does not count. Old attempts are deleted on each check.
  - `POST /api/auth/logout` → deletes the token, clears the cookie (`Max-Age=0`).
  - `GET /api/auth/devices` → `[{ id, kind, name, createdAt, lastUsedAt }]` where `id` is the first 12 chars of the token hash; `DELETE /api/auth/devices/:id` revokes it.
- Tokens: 32 random bytes, base64url; only the SHA-256 hex is stored.
- `scripts/cloud-owner.ts`: asks for email and password (password twice, hidden input, at least 10 characters), hashes with the same `hashPassword` (imported from `worker/src/password.ts`), writes `DELETE FROM owner; INSERT INTO owner ...` to a temp `.sql` file and runs `npx wrangler d1 execute lernzeit --remote --file <tmp>` (`--local` when passed `--local`), then deletes the file. There is no sign-up route.

- [ ] **Step 1: Write the failing tests** (`auth.test.ts`, seeding an owner with `hashPassword('correct horse 1', fixedSalt)`):
  - `login with the right password sets an HttpOnly Secure SameSite=Lax cookie and status says signedIn`
  - `login with device returns a token and no cookie; the Bearer token passes requireOwner`
  - `wrong password → 401 with 'Wrong email or password'`
  - `11th failed attempt from one IP → 429`
  - `logout makes the cookie stop working`
  - `revoking a device makes its token stop working`
  - `GET /api/sync/pull without a session → 401` (route stub until Task 5)
  `scripts/cloud-owner.test.ts`: the hash `hashPassword` makes for a fixed salt equals a constant, and `verifyPassword` accepts it (the same constant is asserted in `auth.test.ts`, so Node and Workers agree).
- [ ] **Step 2:** Run both suites. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS. Full check.

---

### Task 5: Sync API and images

**Files:**
- Create: `worker/src/sync.ts`, `worker/src/images.ts`, `worker/test/sync.test.ts`, `worker/test/images.test.ts`

**Interfaces:**
- Consumes: `requireOwner`, `@lernzeit/core/sync` (tables, limits, types).
- Routes (all behind `requireOwner`):
  - `POST /api/sync/push` `{ changes: SyncChange[] }` → `PushResponse`. 400 on an unknown `tbl`, an unsynced kv key, an id longer than `MAX_ID_LENGTH`, more than `MAX_PUSH_CHANGES`, or a record over `MAX_RECORD_BYTES`; 413 on a body over `MAX_PUSH_BYTES`.
  - `GET /api/sync/pull?cursor=<c>&limit=<n>` → `PullResponse`, ordered by `(seq, tbl, id)`, `limit` capped at `MAX_PULL_CHANGES`, `cursor` an opaque base64url of `[seq, tbl, id]` (empty = from the start). Deleted records come back with `data: null, deleted: true`.
  - `POST /api/sync/reset` → `{ at: number }`: tombstones every live record with `updated_at = Date.now()` and deletes every blob.
  - `PUT /api/images/:id` (body = bytes, `Content-Type: image/*`, at most `MAX_IMAGE_BYTES`) → 204; `GET /api/images/:id` → bytes with their type and `Cache-Control: private, max-age=31536000, immutable`, 404 when missing.

Push is one `DB.batch` of three statements, so each push gets a single new `seq` and is atomic:

```sql
-- 1
INSERT INTO counters (owner, seq) VALUES (?1, 1) ON CONFLICT (owner) DO UPDATE SET seq = seq + 1;
-- 2  (?2 = JSON array of {tbl, id, data: string|null, updatedAt, deleted: 0|1})
INSERT INTO records (owner, tbl, id, data, updated_at, deleted, seq)
SELECT ?1, j.value ->> 'tbl', j.value ->> 'id', j.value ->> 'data', j.value ->> 'updatedAt', j.value ->> 'deleted',
       (SELECT seq FROM counters WHERE owner = ?1)
FROM json_each(?2) AS j WHERE true
ON CONFLICT (owner, tbl, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at,
  deleted = excluded.deleted, seq = excluded.seq
WHERE excluded.updated_at >= records.updated_at;
-- 3
DELETE FROM blobs WHERE owner = ?1 AND id IN (SELECT id FROM records WHERE owner = ?1 AND tbl = 'images'
  AND deleted = 1 AND seq = (SELECT seq FROM counters WHERE owner = ?1));
```

`data` is `JSON.stringify(change.data)` made in the Worker, so the pulled `data` is parsed back with `JSON.parse`. `applied` = `changes()` of statement 2 as D1 reports it (`meta.changes`). Pull uses `WHERE owner = ?1 AND (seq, tbl, id) > (?2, ?3, ?4) ORDER BY seq, tbl, id LIMIT ?5`, fetching `limit + 1` rows to set `more`.

- [ ] **Step 1: Write the failing tests** (`sync.test.ts`, signed in with a device token):
  - `push then pull returns the record with its data and a seq`
  - `an older updatedAt does not replace a newer one; an equal one does`
  - `a tombstone comes back as deleted with null data`
  - `pull pages: 1200 records with limit 500 come back in 3 pages, no duplicates, none missing` (pushed in 3 batches)
  - `records pushed in one batch share a seq and still page correctly with limit 1`
  - `two devices writing the same record: the newer one wins whatever the arrival order`
  - `unknown table, kv key 'tour', 501 changes → 400`
  - `reset tombstones everything; a record pushed afterwards with a newer time is live`
  `images.test.ts`: `put then get returns the same bytes and type`, `non-image type → 415`, `too large → 413`, `tombstoning the images record deletes the blob (get → 404)`, `reset deletes blobs`.
- [ ] **Step 2:** Run `npm test -w lernzeit-worker`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS. Full check.

---

### Task 6: Device settings and the timer's owner device

**Files:**
- Modify: `src/db/db.ts` (Dexie `version(9)`: `outbox: '[tbl+id], at'`, `meta: 'key'`; `KV_KEYS.deviceSettings = 'deviceSettings'`; `getSettings` merges `DEFAULT_SETTINGS`, `settings` and `deviceSettings`, with device keys falling back to the old `settings` values while `deviceSettings` is missing; `updateSettings` writes through `splitSettings`), `src/data/hooks.ts` (`useSettings` observes both kv rows and returns the same merge), `packages/core/src/types.ts` (`ActiveTimer.deviceId?: string`), `packages/core/src/timer.ts` (add `ownsTimer`), `src/data/timer.ts` (new timers get `deviceId`), `src/app/engines.tsx` (`TimerEngine` completes phases, plays sounds and notifies only when `ownsTimer`)
- Create: `src/sync/device.ts`
- Test: `src/data/data.test.ts` (add), `packages/core/src/timer.test.ts` (add)

**Interfaces:**
- Produces: `getDeviceId(database = db): Promise<string>` (a UUID stored once in `meta` under `deviceId`); `ownsTimer(timer: ActiveTimer, deviceId: string): boolean` (`!timer.deviceId || timer.deviceId === deviceId`).

- [ ] **Step 1: Write the failing tests**: `updateSettings({ theme: 'dark' })` writes `theme` to `deviceSettings` and not to `settings`; a database with only an old `settings` row holding `theme: 'dark'` reads `theme: 'dark'`; `ownsTimer({ ...t, deviceId: 'a' }, 'b') === false`, `ownsTimer({ ...t }, 'b') === true`; a timer started via the timer data API carries `getDeviceId()`; stopping a run from a device that doesn't own it saves sessions with ids `${runId}:${cycle}:${i}`, the same ids the owner would save.
- [ ] **Step 2:** Run `npx vitest run src/data/data.test.ts packages/core/src/timer.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS. Check in the browser: Settings theme and voice still change and persist after reload. Full check.

---

### Task 7: Outbox middleware and the sync engine

**Files:**
- Create: `src/sync/outbox.ts`, `src/sync/api.ts`, `src/sync/engine.ts`, `src/sync/status.ts`
- Test: `src/sync/outbox.test.ts`, `src/sync/engine.test.ts` (fake-indexeddb, `fetch` stubbed with an in-memory server that applies the same newest-wins rule)

**Interfaces:**
- Produces (`outbox.ts`): `syncMiddleware: Middleware<DBCore>` registered in the `LernzeitDB` constructor with `this.use(syncMiddleware)`. On every `add`/`put`/`delete`/`deleteRange` to a synced table (kv: synced keys only) it writes `{ tbl, id, at: Date.now() }` into `outbox` in the same transaction (the middleware widens readwrite transactions on synced tables to include `outbox`). `deleteRange` records one entry per existing key. `applyRemote<T>(database, fn: () => Promise<T>): Promise<T>` runs `fn` in a transaction whose writes the middleware does not record.
- Produces (`api.ts`): `push(changes: SyncChange[]): Promise<PushResponse>`, `pull(cursor: string): Promise<PullResponse>`, `putImage(id: string, blob: Blob): Promise<void>`, `getImage(id: string): Promise<Blob>`, `resetCloud(): Promise<{ at: number }>`, `authStatus()`, `login(email, password)`, `logout()`. All on the same origin under `/api`, `credentials: 'same-origin'`. Throws `SignedOutError` on 401 and `OfflineError` when `fetch` rejects.
- Produces (`engine.ts`): `syncNow(database = db): Promise<{ pushed: number; pulled: number }>`, single-flight per tab and across tabs (`navigator.locks.request('lernzeit-sync', …)` when available); `startSync()` / `stopSync()` for the triggers: start, `online`, `visibilitychange` to visible, 2 s after the last outbox write, every 60 s while visible.
- Produces (`status.ts`): `useSyncStatus(): { state: 'idle' | 'syncing' | 'offline' | 'signedOut' | 'error'; pending: number; lastSyncedAt?: number; error?: string }`.

**Push:** read outbox entries oldest first; for each, read the current row (missing row = tombstone); `updatedAt = entry.at`; images send `imageMeta(row)` as data and `putImage` the blob first; batch by `MAX_PUSH_CHANGES` and `MAX_PUSH_BYTES`. After each acked batch, delete only the outbox entries whose `at` is unchanged.

**Pull:** from `meta.cursor` until `more` is false. For each change: if the outbox has an entry for `(tbl, id)` with `at > change.updatedAt`, skip it; otherwise write or delete locally inside `applyRemote`, and delete an outbox entry with `at <= change.updatedAt`. For a live `images` change whose blob is not local, `getImage` first; if that fails, stop this pull without moving the cursor. Save the cursor after each page.

- [ ] **Step 1: Write the failing tests**:
  - `outbox.test.ts`: `put on cards records an entry`; `put on kv 'tour' records nothing, kv 'settings' records one`; `put on clips records nothing`; `clear() on tasks records an entry per task`; `two puts on one card leave one entry with the later at`; `applyRemote writes record nothing`.
  - `engine.test.ts`: `a local card reaches the server and a second database pulls it`; `a delete reaches the other database`; `an edit made during an in-flight push stays in the outbox and is pushed next` (Review Focus 2); `a pulled change older than a pending local edit is skipped, and the local edit wins on the server` (Review Focus 3); `an image is uploaded before its record and downloaded before it is applied`; `a failed image download leaves the cursor unchanged`; `401 sets the status to signedOut`; `a fetch failure sets offline and keeps the outbox`.
- [ ] **Step 2:** Run `npx vitest run src/sync`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS. Run the whole web suite: existing tests stay green with the middleware on. Full check.

---

### Task 8: Sign-in, first-sign-in merge and sign-out

**Files:**
- Modify: `src/features/login/LoginPage.tsx` (email and password fields calling `login`; errors from the server shown under the form; the slides stay), `src/app/App.tsx` (gate on the account, not `SIGNED_IN_KEY`), `src/app/layout/AppShell.tsx` (a small sync row in the sidebar under the AI row, and the Settings icon dot on phones, showing `useSyncStatus` in plain words: "Synced", "Syncing…", "Offline · 3 changes waiting", "Signed out"), `src/features/settings/SettingsPage.tsx` (an Account group: email, last sync, **Sync now**, **Sign out**, and the signed-in devices from `GET /api/auth/devices` with name, last used and **Remove**, the current browser marked "This browser" and not removable)
- Delete: `src/features/login/login.ts` (the hardcoded login)
- Create: `src/sync/account.ts`, `src/sync/firstSignIn.ts`, `src/features/login/MergeDialog.tsx`
- Test: `src/sync/firstSignIn.test.ts`, `src/sync/account.test.ts`

**Interfaces:**
- Produces (`account.ts`): `useAccount(): { email: string } | null | undefined` (undefined while loading) from `meta.account`; `signIn(email, password): Promise<void>` (calls `login`, saves `meta.account`, runs `mergeIntoCloud` if `meta.merged` is unset, then `startSync()`); `signOut(): Promise<'done' | 'unsynced'>` (runs `syncNow`; if the outbox is still not empty, returns `'unsynced'` so the UI can ask "3 changes are not uploaded yet. Sign out anyway?"; on confirm `signOut({ force: true })` calls `logout`, clears every synced table, `outbox` and `meta` except `deviceId`, and reloads).
- The app shows the sign-in page only when `meta.account` is missing. Offline with an account → the app opens on local data (Review Focus 4). A `SignedOutError` from sync deletes `meta.account` and keeps local data and the outbox, so signing in again pushes them.
- Produces (`firstSignIn.ts`): `mergeIntoCloud(database = db, onStep?: (step: string) => void): Promise<FoldResult['summary']>`:
  1. Pull every cloud record into memory (live ones form the cloud `Library`), keep the final cursor.
  2. Read the local `Library` (synced tables, images as `ImageMeta`, synced kv keys).
  3. `foldLibraries(local, cloud)`.
  4. `putImage` every upload image not in the cloud; push `upload` with `updatedAt = uploadTime(tbl, row)`.
  5. In one `applyRemote` transaction: clear the synced tables except `images`, delete `dropLocal` images, then pull from the empty cursor and apply every live record (images: fetch bytes only when missing locally).
  6. Set `meta.merged = true` and `meta.cursor`.
  Steps 1–4 change nothing locally, so a failure there leaves the browser as it was; the dialog shows the error and **Try again**.
- `MergeDialog` blocks the app while merging ("Adding this browser's data to your account…") and then shows the summary: "Added 214 cards, 12 stories… Folded 898 duplicate cards from the starter." with **Done**.

- [ ] **Step 1: Write the failing tests** (`firstSignIn.test.ts`, two fake-indexeddb databases and the in-memory server from Task 7):
  - `first browser uploads everything; the cloud then holds every record`
  - `second browser with the same starter and its own German topic ends with one German topic and no duplicate decks or cards` (Review Focus 1)
  - `the browser that practised more keeps its review state on both browsers after both have synced`
  - `a failure while pushing leaves local data unchanged and merged unset`
  - `images: a local image already in the cloud is not uploaded again`
  `account.test.ts`: `signOut with an unsynced outbox returns 'unsynced' and keeps data`; `a 401 clears the account but keeps the outbox`; `with an account and no network the app state is signed in` (Review Focus 4).
- [ ] **Step 2:** Run `npx vitest run src/sync`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS. Full check.

---

### Task 9: Restore and reset across devices

**Files:**
- Modify: `src/data/io.ts` (`restoreBackup` and `resetAllData`), `src/features/settings/SettingsPage.tsx` (confirm texts)
- Test: `src/data/data.test.ts` (adjust the existing restore and reset tests), `src/sync/engine.test.ts` (add)

**Interfaces:**
- `resetAllData(database = db)`: when signed in, `resetCloud()` first; then inside `applyRemote` clear the synced tables, synced kv keys and `outbox`; device kv keys and `meta` stay. Signed out: refuse with "Sign in to reset your library." The confirm asks the owner to type `reset` and says: "This deletes your whole library on every device: cards, progress, sessions, stories, tasks and docs. Cloudflare can restore the last 7 days (see docs/cloud.md)."
- `restoreBackup(raw, database = db)`: validates as today, then `resetCloud()`, clears locally like reset, and writes the backup **through the normal tables** so the outbox records every row; then `syncNow()`. The confirm says: "This replaces your library on every device with the backup."
- Images in the backup are uploaded by the engine's normal push.

- [ ] **Step 1: Write the failing tests**: `reset on one database empties the other after it syncs`; `restore uploads every backup record and the other database receives them`; `reset keeps deviceId and deviceSettings`; the old restore test still checks the restored counts.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS. Full check.

---

### Task 10: Local dev, deploy and docs

**Files:**
- Modify: `vite.config.ts` (`server.proxy` and `preview.proxy`: `'/api': { target: process.env.LERNZEIT_CLOUD_URL, changeOrigin: true }`, read with `loadEnv`; `workbox.navigateFallbackDenylist: [/^\/api\//]`), `wrangler.jsonc` (real `database_id`), `.env` (create, committed: `LERNZEIT_CLOUD_URL=https://lernzeit.<subdomain>.workers.dev`; not a secret), `README.md` (Get started, the Local-first bullet becomes "Your library in your own Cloudflare account, with an offline copy", Privacy, Deploy), `docs/cloud.md` (create: how sync works, newest wins, the merge, devices, Time Travel restore command `npx wrangler d1 time-travel restore lernzeit --timestamp=<unix>`, setting the owner password, revoking a device), `docs/mcp-bridge.md` (a note that the bridge still works and its writes now sync; plan 2 replaces it)

- [ ] **Step 1:** Ask the owner to run `npx wrangler login` in a terminal and wait until they say it's done.
- [ ] **Step 2:** `npx wrangler d1 create lernzeit`, put the id in `wrangler.jsonc`, `npx wrangler d1 migrations apply lernzeit --remote`. Expected: the migration lists `0001_init.sql` as applied.
- [ ] **Step 3:** `npm run build && npx wrangler deploy` (tell the owner you are deploying). Expected: the workers.dev URL is printed; put it in `.env`. `curl -s <url>/api/health` → `{"ok":true}`.
- [ ] **Step 4:** Ask the owner to run `npm run cloud:owner` and type their email and password.
- [ ] **Step 5:** Browser check on the deployed site and on the dev server through the proxy: sign in, merge summary, a card made in one browser appears in a second browser profile within a minute, a deleted task disappears in the other, offline mode (DevTools offline) keeps working and catches up, sign-out asks about unsynced changes, no console errors.
- [ ] **Step 6:** Full check, then update the README and docs, and report to the owner with screenshots.
