# Cloud sync

Your library lives in your own Cloudflare account, and every browser or phone you sign in on keeps an offline copy. One Cloudflare Worker serves the app and the sync API, and a D1 database holds the data.

## What is in the cloud

| Part | Where | Job |
|---|---|---|
| The app | `dist/`, served by the Worker | The same app you run locally |
| `/api` | [worker/](../worker) (Hono) | Sign-in, sync, images, devices |
| Database | Cloudflare D1, named `lernzeit` | Every record, every image, the owner and the devices |
| Offline copy | IndexedDB in each browser | What the app reads and writes. Works with no connection |

There is one account, the owner. There is no sign-up page: you create the owner yourself (see [Create the owner](#create-the-owner)). Images are stored in D1 too, so there is no R2 bucket to set up.

## How sync works

The app always reads and writes its own copy. Each change is also written to an outbox, and sync sends the outbox to the cloud and pulls what other devices changed.

- **Newest change wins, per record.** Two devices that edit the same card keep the later edit. A card edited on your laptop and a task added on your phone both survive, because they are different records.
- **Deletes travel too.** Deleting a card, task or doc on one device removes it on the others.
- **When it runs:** on start, when you return to the tab, when the browser comes back online, 2 seconds after a change, and every 60 seconds.
- The sidebar has a **Sync** row with the state, and **Settings → Account** has the email, when it last synced, and **Sync now**.

### Offline

With no connection the app works on its own copy: you can review, write, add cards and run the timer. The changes wait in the outbox and go up when the browser is online again.

### Changes the cloud refuses

The cloud limits the size of what it accepts: about 1 MB for one record and 1.5 MB for one image. A change over the limit stays on the device and shows as **can't be uploaded** in the sidebar and under **Settings → Account**, with the reason. Everything else keeps syncing. Make the item smaller (a shorter doc, a smaller image) and the change goes up. Each time the app starts, a refused change gets one more try, in case the cloud takes it now; if not, it shows as **can't be uploaded** again.

If the cloud no longer has the bytes of an image, the card or doc that uses it syncs without the picture instead of stopping the sync. Each time the app starts, it asks for the picture again and shows it once the bytes are back.

A request that gets no answer gives up after 30 seconds (2 minutes for an image), and sync counts as offline until the next try.

## The first sign-in

The first time a browser signs in, it merges what it already has into the cloud, and shows a summary.

- Records that are only here are uploaded. Records that are only in the cloud are downloaded.
- **The starter is shared.** Its decks, cards, stories, questions and grammar topics carry the same ids in every browser, so both sides hold the same records. Only the German topic (and images) get new ids in each browser.
- **Duplicates are folded.** The same thing under different ids (the German topic, or a deck or card you added in both browsers) is folded into the cloud's copy: topics match by name, decks by name inside the topic, and cards by their words inside the deck. Stories, questions, grammar topics and docs with the same content fold too. The extra items that only this browser has stay.
- **Practice progress keeps the more-practised side.** For each card's review state (also for drill and grammar-exercise scores) the side with more reviews or answers is kept, the later one on a tie, whichever browser changed it last. Every review log from both sides is kept.
- A question you answered yourself folds only into a copy with the same answer.
- **It only adds.** A first sign-in never deletes this browser's data: a record the cloud deleted (after **Delete all data**, or a delete on another device) comes back if this browser still has it.

If the cloud can't be reached, the merge says so, and **Use offline for now** opens the app on this browser's data with sync off. The merge runs again when the browser is back online, or the next time the app starts.

Do this once per browser. After that, the normal rule applies (newest change wins).

### Merging two studied browsers

When both browsers were used before signing in, the merge decides record by record:

- **Practice progress** (reviews, review logs, drill and exercise scores) keeps the more-practised side, as above.
- **Topic goals and settings keep the cloud's version.**
- **A card, deck, story or grammar topic changed on both sides** (the same id) keeps one version whole, not a mix: the cloud's, unless this browser's edit is the later one. Edit it again afterwards if you wanted the other.

## What syncs and what stays on the device

| Syncs | Stays on each device |
|---|---|
| Cards, decks, reviews and practice history | The Thorsten voice and its speech-clip cache |
| Stories, questions, grammar topics and your answers | Voice engine and voice choice, speaking speed |
| Docs and their images | Theme |
| Tasks, topics, goals and study sessions | Reminders and their times |
| The other settings (features on and off, timer lengths) | The tour state |

Only the device that started a timer rings when it ends, so two open browsers do not both play the bell.

## Devices and signing out

**Settings → Account** lists the browsers that are signed in, with when each was last used. **Remove** signs one out: it has to sign in again to sync, and its own copy of the library stays on it.

**Sign out** on this browser signs it out and clears its copy of the library. It syncs first. If some changes could not be uploaded, it asks **Sign out anyway?**, because signing out would lose them.

Sign-in is rate limited: after 10 failed tries from one address, it refuses for 15 minutes.

## Restore and reset

**Restore backup** (Settings → Your data) and **Delete all data** apply to every device: the other devices get the restored or emptied library on their next sync. Delete all data needs you to type `reset`.

After a reset, the tour state and the speech-clip cache stay on each device, because they are not part of the library.

### Undo a bad restore or reset with Time Travel

D1 keeps a history of the database. If a restore or reset was a mistake, put the cloud back to an earlier time. You need `npx wrangler login` once.

```bash
npx wrangler d1 time-travel info lernzeit
npx wrangler d1 time-travel restore lernzeit --timestamp=<unix seconds or RFC3339>
```

`info` shows the current bookmark. `--timestamp` takes Unix seconds (`1795264800`) or an RFC3339 time (`2026-11-21T08:30:00Z`); pick a moment before the mistake. You can restore only within the history window: 7 days on the free plan, 30 on the paid plan. You can also restore to a `--bookmark` from `info`.

This changes the cloud, not the devices, and the devices resync by themselves. On its next sync each device sees that the cloud went back past what it had pulled (the cloud answers its pull with `409 { "resync": true }`) and merges its copy in again, as on a first sign-in: what it has that the restored cloud lacks goes back up as whole records, and it takes in the rest. Edits to records that still exist in the restored cloud are rolled back: the cloud's older version wins for those. So after undoing a bad **reset**, devices that kept their data put it back too. To undo a bad **restore** on every device, also use **Restore backup** on one device afterwards: it sets the library you choose everywhere.

## Change the owner password

Run `npm run cloud:owner` again and type a new password. It replaces the owner, keeps all your data, and **signs every device out**, so each one signs in again. Apps connected to the MCP endpoint, such as Claude, are disconnected too: their next call is refused, and they ask for the new password.

## Create the owner

```bash
npm run cloud:owner
```

It asks for your email and a password of at least 10 characters (typed twice, hidden). Only a hash of the password is stored. For the local database add `--local`:

```bash
npm run cloud:owner -- --local
```

With `--local`, it uses `LERNZEIT_OWNER_EMAIL` and `LERNZEIT_OWNER_PASSWORD` instead of asking when both are set.

## Local development

`npm run dev` and `lz` serve the app and send `/api` to the cloud address in [.env](../.env), `LERNZEIT_CLOUD_URL`. It holds the deployed Worker's address, which is not a secret. So by default local dev signs in to your real cloud data.

To work against a local Worker instead:

1. Start it: `npm run worker:dev`. It applies the migrations to a local D1 (in `.wrangler/`) and serves the API on `http://127.0.0.1:8787`.
2. Create a local owner: `npm run cloud:owner -- --local`.
3. Create `.env.local` (not committed) with `LERNZEIT_CLOUD_URL=http://127.0.0.1:8787`. Vite reads `.env.local` after `.env`, so it wins. A `LERNZEIT_CLOUD_URL` set in the shell wins over both.
4. Start `npm run dev` in another terminal, and restart it whenever you change the address.

The local data is separate from the deployed data, so you can try things safely. Delete `.wrangler/` to start it empty.

## Deploy

Once:

```bash
npx wrangler login
npx wrangler d1 create lernzeit
npx wrangler kv namespace create OAUTH_KV
```

Put the printed `database_id` in [wrangler.jsonc](../wrangler.jsonc) under `d1_databases`, and the KV namespace's `id` under `kv_namespaces` (binding `OAUTH_KV`: it holds the sign-ins of the apps connected to `/mcp`, see [mcp.md](mcp.md)). Then create the tables (this applies every migration in `worker/migrations/`), deploy, and create the owner:

```bash
npx wrangler d1 migrations apply lernzeit --remote
npm run build && npx wrangler deploy
npm run cloud:owner
```

`wrangler deploy` prints the address, such as `https://lernzeit.<your-subdomain>.workers.dev`. Put it in `.env` as `LERNZEIT_CLOUD_URL`. `/api/health` answers `{"ok":true}` when the Worker is up.

Each time after:

- Code changed: `npm run build && npx wrangler deploy`.
- A new file in `worker/migrations/`: `npx wrangler d1 migrations apply lernzeit --remote` first, then deploy.

The Worker answers `/api/*`, and `/mcp` with its OAuth routes (`/authorize`, `/token`, `/register`, `/.well-known/*`). Every other request is served from `dist/` straight away, and client-side routes such as `/flashcards` get `index.html`. Open the address on your phone and choose **Add to Home screen**.

## Claude

The Worker also serves an MCP endpoint at `/mcp`, behind an OAuth sign-in with your Lernzeit password, so Claude on your phone, on the web, in Claude Desktop or in Claude Code can add to your library without a computer running. What it saves goes to the same database and reaches your devices on the next sync. [mcp.md](mcp.md) has the setup.
