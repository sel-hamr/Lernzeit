# Remote MCP Implementation Plan (plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude (mobile, web, Desktop, Code) adds and reads Lernzeit data through an MCP server on the deployed Worker, signed in with OAuth, working straight on the cloud library; the local stdio server and browser bridge are retired.

**Architecture:** The tool rules move into `packages/core/src/actions/` and run against a small `LibraryStore` interface. The Worker implements that store over D1 (SQL filters on the JSON records, writes through the same `applyChanges` the sync push uses, so seq and newest-wins hold), serves MCP at `/mcp` with the SDK's `createMcpHandler`, and wraps everything in `@cloudflare/workers-oauth-provider` with a password page for the owner. Browsers see Claude's changes on their next pull.

**Tech Stack:** `@modelcontextprotocol/server@^2.3` (`createMcpHandler`, `McpServer`, `zod` schemas already in `mcp/src/tools.ts`), `@cloudflare/workers-oauth-provider@^1.2` with a KV namespace, Hono, D1, `@cloudflare/vitest-plugin`.

**Spec:** `docs/superpowers/specs/2026-11-21-mobile-app-and-cloud-design.md` (section "Remote MCP server"). Plan 1: `docs/superpowers/plans/2026-11-21-core-cloud-and-web-sync.md`.

## Global Constraints

- Address: `https://lernzeit.selhamr9.workers.dev`; MCP endpoint `https://lernzeit.selhamr9.workers.dev/mcp`.
- Tool names, prompts (`make_cards`, `write_story`, `make_questions`, `make_grammar`, `plan_tasks`, `help`) and the `lernzeit://guide` resource keep today's names, inputs and behaviour, minus `list_browsers` and every `browser` parameter.
- Server instructions drop "only while Lernzeit is open in the browser"; the rest of today's instruction text stays (look before you add, delete only when asked after naming the cards and count).
- Every `/mcp` request needs a valid OAuth access token for the owner. The authorize page asks for the owner password, uses the same PBKDF2 check and the same per-IP rate limit (10 failed tries per 15 minutes) as `/api/auth/login`.
- Writes from MCP go through `applyChanges` with `updatedAt = Date.now()` (server time) and get a seq like any push; deletes are tombstones.
- Dates the user sees (session `date`, midnight split, "today") use the owner's IANA time zone from the synced `settings.timeZone`; fall back to `UTC` when missing.
- No R2; no Docker; never commit secrets. Deploys after the owner's `wrangler login` (done), with a note each time.
- Repo rules as in plan 1: tests next to existing ones, `npm run typecheck && npm test && npm run lint && npm run build` green per task, docs updated, work committed per task on `feat/mobile-cloud`, never pushed.

## Review Focus

1. **A tool call that partly fails** (e.g. 3 of 10 cards invalid) must write nothing or exactly what the tool reports, never a half-written deck. Test owned by Task 3.
2. **Claude writes while a browser has unsynced edits to the same record** (e.g. moves a card the browser just edited): newest-wins by server time, and the browser's pending edit, stamped later, still wins on its push. Test owned by Task 4.
3. **A study session Claude logs late in the evening** lands on the owner's local date, split at local midnight. Test owned by Task 3 (pure) and Task 4 (time zone read from settings).
4. **A stolen or expired token, or a client the owner revoked**, gets 401 from `/mcp` and cannot read or write. Test owned by Task 6.
5. **Duplicate words**: `create_cards` skips words already in the deck exactly as today (same normalisation). Test owned by Task 3.

---

### Task 1: Plan-1 leftovers and the time zone setting

**Files:**
- Modify: `src/data/io.ts` (restore/reset: when the recovery requeue also fails, delete `meta.merged` so the next start merges instead of pulling tombstones), `docs/cloud.md` (the Time Travel paragraph: a resync re-uploads whole records the restored cloud lacks; edits to records that exist in the restored cloud are rolled back), `packages/core/src/types.ts` (`Settings.timeZone?: string`), `packages/core/src/time.ts` (add `dateKeyIn`, `nextMidnightIn`), `src/app/engines.tsx` or a small new engine (on start, when signed in, write `Intl.DateTimeFormat().resolvedOptions().timeZone` into settings if it differs)
- Test: `src/data/data.test.ts`, `packages/core/src/time.test.ts`

**Interfaces:**
- Produces: `dateKeyIn(ms: number, timeZone: string): string` (YYYY-MM-DD in that zone), `nextMidnightIn(ms: number, timeZone: string): number` (ms of the next local midnight; correct across DST changes). `Settings.timeZone` is a shared (synced) key, not a device key.

- [ ] **Step 1: Failing tests**: `dateKeyIn(Date.UTC(2026,10,21,23,30), 'Europe/Berlin') === '2026-11-22'`; same instant in `'America/New_York'` → `'2026-11-21'`; `nextMidnightIn` across the 2026-03-29 Berlin DST change returns local midnight; the double-failure restore test ends with `meta.merged` deleted; an app start with `settings.timeZone` unset writes the browser's zone.
- [ ] **Step 2:** Run: `npx vitest run packages/core/src/time.test.ts src/data/data.test.ts` → FAIL.
- [ ] **Step 3:** Implement with `Intl.DateTimeFormat(..., { timeZone })`.
- [ ] **Step 4:** Run again → PASS; full check; commit.

---

### Task 2: `applyChanges` shared by push and MCP, with stricter push validation

**Files:**
- Create: `worker/src/changes.ts`
- Modify: `worker/src/sync.ts` (the push route calls `applyChanges`), `src/test/syncServer.ts` (same validation)
- Test: `worker/test/sync.test.ts` (add), `worker/test/changes.test.ts`

**Interfaces:**
- Produces: `applyChanges(db: D1Database, owner: string, changes: SyncChange[]): Promise<{ applied: number; seq: number }>` — the existing three-statement batch (counter, upsert with newest-wins, blob cleanup), unchanged semantics. `validateChanges(changes: unknown): SyncChange[]` throws `ChangeError` with the message the route returns as 400.
- New validation (plan-1 parked p1): a live change's `data` must be a plain object (not array, string, number) and its `id` (kv: `key`) must equal the change's `id`.

- [ ] **Step 1: Failing tests**: push with `data: []`, `data: "x"`, `data: { id: 'other' }` for id `a`, kv with `data.key` ≠ id → 400 naming the change; all plan-1 sync tests still pass through the extracted function; `applyChanges` called directly returns the seq and the pulled record matches.
- [ ] **Step 2:** `npm test -w lernzeit-worker` → FAIL.
- [ ] **Step 3:** Implement; the web client already sends conforming data (check `src/sync/engine.ts` builds `data` from the row; kv rows have `key`).
- [ ] **Step 4:** PASS; full check; commit.

---

### Task 3: Tool actions in core, against a store

**Files:**
- Create: `packages/core/src/library.ts` (store interface + memory store), `packages/core/src/actions/index.ts` (`runAction`), `packages/core/src/actions/{topics,decks,cards,stories,questions,grammar,docs,tasks,time}.ts`, and pure helpers moved out of web code where a rule is non-trivial: `packages/core/src/cardPack.ts` (normalise a new card, duplicate check, the card row and its review rows per enabled direction with a new FSRS state — reuse `packages/core/src/srs.ts`), session splitting at local midnight (in `packages/core/src/sessions.ts`, using `nextMidnightIn`).
- Modify: `src/data/io.ts` `writeCardPack` and `src/data/topics.ts` `logManualSession` to use the moved pure helpers (behaviour unchanged; existing tests stay green), `packages/core/src/protocol.ts` (drop `browser` from params, drop `list_browsers`, keep every other type and limit).
- Test: `packages/core/src/actions/*.test.ts` — port every case in `src/bridge/actions.test.ts` (54 tests) to the memory store, plus Review Focus 1, 3, 5.

**Interfaces:**
- Produces (`library.ts`):
  ```ts
  type Filter = Record<string, string | number | boolean | null>   // equality on top-level JSON fields
  interface LibraryStore {
    list<T>(tbl: SyncTable, filter?: Filter): Promise<T[]>         // live rows, staged writes applied
    get<T>(tbl: SyncTable, id: string): Promise<T | undefined>
    count(tbl: SyncTable, filter?: Filter): Promise<number>
    put(tbl: SyncTable, row: object): void                          // staged
    remove(tbl: SyncTable, id: string): void                        // staged tombstone
    commit(): Promise<void>                                         // writes all staged changes at once
    readonly timeZone: string
    readonly now: () => number
  }
  createMemoryStore(seed?: Library, options?: { timeZone?: string; now?: () => number }): LibraryStore & { committed: SyncChange[] }
  ```
- Produces (`actions/index.ts`): `runAction<A extends ActionName>(store: LibraryStore, action: A, params: ActionParams<A>): Promise<ActionResult<A>>`; it calls `store.commit()` once at the end and never on error (Review Focus 1). Ids from `globalThis.crypto.randomUUID()`.
- Behaviour per tool is exactly today's `src/bridge/actions.ts` and the `src/data/*` helpers it calls (read them; e.g. `delete_cards` tombstones the card, its reviews, review logs, drill stats and an image no other card uses; `move_cards` updates the card and its reviews' `deckId`; `create_story` cleans and sorts story words with the same rules and errors).

- [ ] **Step 1:** Port the tests first (they fail: modules missing). Add: a `create_cards` call with one invalid card writes nothing and returns the existing error; duplicates by today's normalisation are skipped and reported; `log_study_time` at 23:30 Berlin for 60 minutes with `timeZone: 'Europe/Berlin'` makes two sessions dated the two local days.
- [ ] **Step 2:** `npx vitest run packages/core/src/actions` → FAIL.
- [ ] **Step 3:** Implement. Keep `packages/core` free of DOM, React, Dexie and Node APIs.
- [ ] **Step 4:** PASS; `npx vitest run src/data` still green (web helpers now use the moved pure functions); full check; commit (one commit per two or three tool groups is fine).

---

### Task 4: The D1 store

**Files:**
- Create: `worker/src/store.ts`
- Test: `worker/test/store.test.ts`, `worker/test/actions.test.ts`

**Interfaces:**
- Consumes: `LibraryStore`, `applyChanges`, `runAction`.
- Produces: `createD1Store(db: D1Database, owner: string, options?: { now?: () => number }): Promise<LibraryStore>` — reads `settings.timeZone` from the `kv/settings` record (default `'UTC'`); `list`/`count` run `SELECT data FROM records WHERE owner = ? AND tbl = ? AND deleted = 0 AND json_extract(data, '$.<field>') = ? …` (field names validated against `/^[A-Za-z][A-Za-z0-9]*$/`; booleans compared as 1/0), then overlay staged puts/removes; `commit()` sends all staged changes through `applyChanges` with `updatedAt = now()`.

- [ ] **Step 1: Failing tests**: a contract suite (`list`, `get`, `count`, filters, read-your-writes, commit) run against both stores; a few end-to-end actions on D1 (`create_deck` + `create_cards` → `/api/sync/pull` returns the deck, cards and review rows with one seq); Review Focus 2: a browser pushes an edit stamped after the MCP write → the browser's edit wins; time zone read from settings.
- [ ] **Step 2:** `npm test -w lernzeit-worker` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; full check; commit.

---

### Task 5: The MCP endpoint

**Files:**
- Create: `worker/src/mcp/server.ts` (builds an `McpServer` with tools, prompts, guide), `worker/src/mcp/tools.ts` (moved from `mcp/src/tools.ts`, calling `runAction` on a D1 store instead of the hub), `worker/src/mcp/guide.ts` and `worker/src/mcp/prompts.ts` (moved from `mcp/src/`), `worker/src/mcp/handler.ts`
- Test: `worker/test/mcp.test.ts` (port the relevant cases of `mcp/src/server.test.ts`)

**Interfaces:**
- Produces: `mcpFetch(request: Request, env: Env, ownerId: string): Promise<Response>` — `createMcpHandler(() => buildServer(env, ownerId), { legacy: 'stateless' })` so both current and 2025-era clients work; each tool call creates a D1 store for `ownerId`.
- Tool errors come back as MCP tool errors with today's readable messages (`toErrorBody`), not HTTP errors.
- Server name `lernzeit`, version from `worker/package.json`; instructions per Global Constraints.

- [ ] **Step 1: Failing tests** (JSON-RPC over `mcpFetch` with a fixed owner): `initialize` → server info and instructions without "browser"; `tools/list` → every tool from today minus `list_browsers`, no `browser` field in any schema; `prompts/list` → the six prompts; `resources/read lernzeit://guide`; `tools/call create_deck` then `list_decks` shows it; a bad input → tool error text.
- [ ] **Step 2:** FAIL. **Step 3:** Implement (use `@modelcontextprotocol/server/validators/cf-worker` if the default validator needs `eval`). **Step 4:** PASS; full check; commit.

---

### Task 6: OAuth and the authorize page

**Files:**
- Create: `worker/src/oauth.ts` (authorize GET/POST handlers), `worker/src/pages/authorize.ts` (server-rendered HTML in the Lernzeit style: Geist from `/assets`, the SPEC §11 colours, a white card, "Allow <client name> to use your Lernzeit?", what it can do: read and add cards, decks, stories, grammar, questions, docs, tasks and study time; delete cards or decks when you ask; password field; Allow / Cancel)
- Modify: `worker/src/index.ts` (export `new OAuthProvider({ apiRoute: '/mcp', apiHandler, defaultHandler: app, authorizeEndpoint: '/authorize', tokenEndpoint: '/token', clientRegistrationEndpoint: '/register', scopesSupported: ['lernzeit'] })`, with `apiHandler` calling `mcpFetch(request, env, ctx.props.ownerId)`), `worker/src/env.ts` (`OAUTH_KV: KVNamespace`, `OAUTH_PROVIDER` helpers type), `wrangler.jsonc` (`kv_namespaces: [{ binding: 'OAUTH_KV', id: '<set at deploy>' }]`, `run_worker_first: ['/api/*', '/mcp', '/mcp/*', '/authorize', '/token', '/register', '/.well-known/*']`), `worker/wrangler.test.jsonc` (KV binding), `worker/src/auth.ts` (export the password check and rate-limit helpers for reuse)
- Test: `worker/test/oauth.test.ts`

**Interfaces:**
- Authorize flow: GET `/authorize` parses the request with `env.OAUTH_PROVIDER.parseAuthRequest`, looks up the client, renders the page with a signed state (or the parsed request round-tripped in a hidden field protected by a short-lived HMAC/KV nonce — builder's choice, but it must be tamper-proof and CSRF-safe). POST checks the password (rate-limited), then `completeAuthorization({ request, userId: 'owner', scope: ['lernzeit'], props: { ownerId: 'owner' }, metadata: { client: clientName } })` and redirects. Cancel redirects with `error=access_denied`.
- Changing the owner password (`npm run cloud:owner`) also revokes every OAuth grant (extend the script's SQL is not possible for KV — instead the Worker refuses tokens whose grant was created before `owner.created_at`: store `ownerCreatedAt` in props and compare on each `/mcp` call).

- [ ] **Step 1: Failing tests**: discovery documents at `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`; `/mcp` without a token → 401 with a `WWW-Authenticate` that points at the metadata; full flow: register a client → GET authorize shows the page and the client name → POST wrong password → page with "Wrong password" (and the 11th failure → "Too many attempts…") → POST right password → redirect with code → token exchange with PKCE → `/mcp` `tools/list` works; a token after the owner row is recreated → 401; a revoked grant → 401 (Review Focus 4); `/api/*` still works with cookie and device token.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS; full check; commit.

---

### Task 7: Retire the bridge; Settings shows the Claude connection

**Files:**
- Delete: `mcp/` (workspace), `src/bridge/` (all files; protocol already lives in core), `src/features/settings/AiConnectionGroup.tsx`, `scripts/setup-mcp.ts` and its test, the `lz mcp` subcommand in `bin/lz.ts`, the `__MCP_SERVER_PATH__` define in `vite.config.ts`, the AI status row in the sidebar and the `BridgeEngine` in `src/app/engines.tsx`, the `bridge` kv key handling.
- Create: `src/features/settings/ClaudeGroup.tsx` ("Claude": the MCP URL with Copy, short steps for Claude on the phone/web ("Settings → Connectors → Add custom connector, paste the URL, sign in with your Lernzeit password") and for Claude Code (`claude mcp add --transport http lernzeit <url>`), and "Connected apps" from `GET /api/mcp/grants` with name, connected date and **Disconnect**), `worker/src/grants.ts` (`GET /api/mcp/grants`, `DELETE /api/mcp/grants/:id`, behind `requireOwner`, using the provider's `listUserGrants` / `revokeGrant`), `docs/mcp.md` (replaces `docs/mcp-bridge.md`)
- Modify: root `package.json` (workspaces and scripts without `mcp`, `mcp:setup` removed), `README.md` ("Connect Claude", "What you can ask", Privacy, Commands, project structure), `src/features/stories/AiStoryDialog.tsx` and any copy that says to keep a browser tab open, `src/sync/indicator.ts` / `AppShell.tsx` references to the bridge
- Test: `worker/test/grants.test.ts`; web tests that referenced the bridge are removed or updated; a test that `ClaudeGroup` renders the URL is optional (UI checked in the browser by the controller)

- [ ] **Step 1:** Failing worker tests for the grants routes (list shows the client after the OAuth flow; DELETE revokes; a later `/mcp` call → 401).
- [ ] **Step 2:** Implement and delete. `grep -rn "bridge\|47821\|list_browsers\|mcp:setup\|lz mcp" src bin scripts docs README.md` returns only historical mentions in `docs/superpowers/`.
- [ ] **Step 3:** Full check (the root `npm test` no longer runs an `mcp` workspace); commit.

---

### Task 8: Deploy and connect Claude

Done by the controller with the owner.

- [ ] **Step 1:** `npx wrangler kv namespace create OAUTH_KV`, put its id in `wrangler.jsonc`.
- [ ] **Step 2:** `npm run build && npx wrangler deploy` (tell the owner). `curl --ssl-no-revoke` the two discovery documents and `/mcp` without a token (→ 401).
- [ ] **Step 3:** The owner adds the connector in Claude (claude.ai → Settings → Connectors → Add custom connector → `https://lernzeit.selhamr9.workers.dev/mcp`), signs in on the authorize page, then on the phone asks Claude: "List my Lernzeit decks" and "Add 3 A1 cards about the kitchen to a new deck Küche".
- [ ] **Step 4:** Check the cards arrive: query D1 for the deck, then the web app shows it after **Sync now**. Settings → Claude lists the connection.
- [ ] **Step 5:** Update `docs/mcp.md` with anything learned; full check; commit.
