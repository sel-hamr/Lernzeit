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

The cloud limits the size of what it accepts: about 1 MB for one record and 1.5 MB for one image. A change over the limit stays on the device and shows as **can't be uploaded** in the sidebar and under **Settings → Account**, with the reason. Everything else keeps syncing. Make the item smaller (a shorter doc, a smaller image) and the change goes up.

If the cloud no longer has the bytes of an image, the card or doc that uses it syncs without the picture instead of stopping the sync.

## The first sign-in

The first time a browser signs in, it merges what it already has into the cloud, and shows a summary.

- Records that are only here are uploaded. Records that are only in the cloud are downloaded.
- **Duplicates are folded.** Each browser installs the German starter on its own, with its own ids, so the same topic, decks, cards, stories, questions, grammar topics and docs can be on both sides. Topics match by name, decks by name inside the topic, and cards by their words inside the deck. The local copy is dropped and the cloud's is kept, and the extra items that only this browser has stay.
- Where both sides have the same card, the copy with **more reviews** is kept, so your progress is not lost.
- A question you answered yourself folds only into a copy with the same answer.

Do this once per browser. After that, the normal rule applies (newest change wins).

## What syncs and what stays on the device

| Syncs | Stays on each device |
|---|---|
| Cards, decks, reviews and practice history | The Thorsten voice and its speech-clip cache |
| Stories, questions, grammar topics and your answers | Voice engine and voice choice, speaking speed |
| Docs and their images | Theme |
| Tasks, topics, goals and study sessions | Reminders and their times |
| The other settings (features on and off, timer lengths) | The tour state, the AI connection settings |

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

This changes the cloud, not the devices. A device that already has the newer data will upload it again on its next sync, so after a restore sign out of the other devices (**Remove** them) or use **Restore backup** on one of them to set the data you want.

## Change the owner password

Run `npm run cloud:owner` again and type a new password. It replaces the owner, keeps all your data, and **signs every device out**, so each one signs in again.

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
```

Put the printed `database_id` in [wrangler.jsonc](../wrangler.jsonc). Then create the tables, deploy, and create the owner:

```bash
npx wrangler d1 migrations apply lernzeit --remote
npm run build && npx wrangler deploy
npm run cloud:owner
```

`wrangler deploy` prints the address, such as `https://lernzeit.<your-subdomain>.workers.dev`. Put it in `.env` as `LERNZEIT_CLOUD_URL`. `/api/health` answers `{"ok":true}` when the Worker is up.

Each time after:

- Code changed: `npm run build && npx wrangler deploy`.
- A new file in `worker/migrations/`: `npx wrangler d1 migrations apply lernzeit --remote` first, then deploy.

The Worker answers only `/api/*`. Every other request is served from `dist/` straight away, and client-side routes such as `/flashcards` get `index.html`. Open the address on your phone and choose **Add to Home screen**.

## The AI connection

The local [MCP bridge](mcp-bridge.md) still works, and what it saves syncs like anything else. A remote MCP server, so Claude on your phone can reach your library without a computer, is planned.
