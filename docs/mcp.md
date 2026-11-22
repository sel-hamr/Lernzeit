# Claude and MCP

Lets Claude (on your phone, claude.ai, Claude Desktop or Claude Code) add cards, decks, stories, practice questions, grammar, docs, tasks and study time to Lernzeit, read and move cards, and delete the cards or decks you name.

Claude talks to your own Lernzeit Worker. The Worker serves an [MCP](https://modelcontextprotocol.io) endpoint at `/mcp`, behind a sign-in with your Lernzeit password, and saves into the same cloud database the app syncs with ([cloud.md](cloud.md)). Nothing runs on your computer and no browser tab has to stay open.

## Connect Claude

Open **Settings → Claude** in Lernzeit. It shows the connector address, your Worker's address plus `/mcp` (for example `https://lernzeit.example.workers.dev/mcp`), with a **Copy** button. The Worker reports it (`GET /api/mcp/info`, signed in), so it is right under `npm run dev` on localhost too.

**Claude on your phone, on claude.ai or in Claude Desktop**

1. Open **Settings → Connectors → Add custom connector**.
2. Paste the address and add it.
3. Claude opens the Lernzeit sign-in page. Type your Lernzeit password and choose **Allow**.

Add it once on any of them; a connector added on claude.ai shows up in the phone app too.

**Claude Code**

```bash
claude mcp add --transport http lernzeit https://lernzeit.example.workers.dev/mcp
```

Then run `/mcp` inside Claude Code and choose **Authenticate**. Your browser opens the same sign-in page.

### The password page

`/authorize` is a plain page served by the Worker, with no script on it. It names the app that asks and the host it will send access to, and it allows only when you type the owner password. The password is checked by the same code, and under the same limit (10 wrong tries per address in 15 minutes), as signing in to the app. Allowing gives the app a token pair; Claude keeps them, Lernzeit stores only hashes.

Connecting needs the `https` address of Lernzeit. On `npm run worker:dev` the page works on `localhost` too, but not on a LAN address over plain `http`.

## What you can ask

Examples are in the [README](../README.md#what-you-can-ask-claude). Behind them are these tools:

| Tool | Does |
|---|---|
| `list_topics`, `list_decks`, `list_grammar_topics` | Look before adding |
| `create_deck`, `create_cards` | Add decks and cards, tagged `ai`; a German word already in the deck is skipped. Up to 100 cards per call |
| `list_cards`, `move_cards` | Read cards (never review progress or your answers) and move them to another deck with their progress |
| `delete_cards`, `delete_deck` | Delete the cards or the deck you name. They cannot be undone, so Claude names them back to you first |
| `create_story`, `create_questions`, `add_grammar` | Add stories with word notes, speaking questions, and grammar topics or exercises |
| `list_docs`, `read_doc`, `create_doc` | Read and save Markdown on the Docs page |
| `create_task`, `log_study_time` | Add a task to the Board, log study time done away from the timer |

Details worth knowing:

- `delete_deck` takes the deck's card count from `list_decks` and refuses when it differs, and it deletes at most **500 cards** with the deck. Claude empties a bigger deck with `delete_cards` first.
- `create_cards` has no image upload. `emoji` and `imageQuery` work.
- Calls Claude sends at the same time do not lose each other's work. A call saves only if nothing else (another call, a device's sync) wrote since it started reading; otherwise it runs again from the start, up to 4 times, and then answers "Lernzeit was busy; try again."
- Grammar exercises the app cannot use are refused with their number and the reason before anything is saved ([grammar.md](grammar.md#writing-a-topic)). Existing cards, stories, questions and exercises are never edited, only added to.
- The connector also offers the `lernzeit://guide` resource, which teaches Claude how to write good German cards, and the prompts `make_cards`, `write_story`, `make_questions`, `make_grammar`, `plan_tasks` and `help`. Pick them from the **+** menu in Claude.
- The tools have their own usage notes in the guide ([worker/src/mcp/guide.ts](../worker/src/mcp/guide.ts)); a test checks it mentions every tool.

## When changes reach your devices

Claude writes to the cloud database. The app syncs on a timer (about once a minute while it is visible) and when you open it, so what Claude saved appears on its own. **Settings → Account → Sync now** brings it in at once. If a device is offline, it catches up later.

Dates and times Claude saves (study sessions, due dates) use the time zone of the signed-in device that started most recently (it syncs as its own record, `kv/timeZone`), since the Worker has no time zone of its own. With none synced yet, they are in UTC.

## Disconnecting

- **One app:** **Settings → Claude → Connected apps → Disconnect**. Its tokens stop working at once, and it asks for your password again if you connect it again. What it saved stays.
- **Every app:** run `npm run cloud:owner` and set a new password ([cloud.md](cloud.md)). Every app connected before the change is refused on its next call and disconnected.

The list comes from `GET /api/mcp/grants` (name and date, never a token), and **Disconnect** is `DELETE /api/mcp/grants/:id`. Both need you to be signed in to the app.

## Which sites may receive access: `OAUTH_REDIRECT_HOSTS`

After you allow an app, the Worker sends you back to the address the app registered. It only does that for hosts on a list: the setting `OAUTH_REDIRECT_HOSTS` in [wrangler.jsonc](../wrangler.jsonc), separated by commas. The default is `claude.ai,claude.com,localhost,127.0.0.1,[::1]`: Claude on the web, desktop and phone, and Claude Code and other local apps on a port of your own computer.

A listed host is matched exactly and over `https`; the three loopback hosts also take plain `http` on any port. Registering a client with any other redirect is refused, and so is the authorize page for a client stored before a host was removed.

To use another MCP app, such as one hosted at `app.example.com`, add the host and deploy again:

```jsonc
"OAUTH_REDIRECT_HOSTS": "claude.ai,claude.com,localhost,127.0.0.1,[::1],app.example.com"
```

## Limits

- Everything saved by Claude goes to the cloud; a browser that is signed out or has never synced does not get it until it signs in.
- The authorize page and client registration are rate limited per address, so a stranger cannot fill your storage, and all addresses together get 200 of these sign-in steps a day. That keeps them far below the free plan's 1,000 KV writes a day, which connected apps also need to refresh their tokens. Past it, the page says "Too many sign-in attempts today. Try again tomorrow."; apps already connected keep working.
- An app you stop using expires: a registration nobody uses for 30 days is removed, and so is a connection whose tokens are not refreshed for 30 days. An app in use stays connected: every refresh (about once an hour while Claude works with Lernzeit) gives it 30 more days.
