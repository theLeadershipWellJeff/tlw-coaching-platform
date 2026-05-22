# Buffer MCP Server (TheLeadershipWell)

Draft social posts in Claude, say "send it", and have them queued in Buffer for
LinkedIn / Facebook / Instagram on a default schedule. Replaces the $400/mo
HubSpot social subscription.

This is the third MCP server in the TLW stack (after Coach Accountable and
HubSpot). It runs locally over stdio. v1 is solo-use; later it will fold into
the TLW coaching app as a module.

---

## Quick start

```bash
# from this folder (mcp-servers/buffer)
npm install
cp config.example.json config.json     # fill in API key + channel IDs
npm run list-channels                  # Phase 1 sanity check
npm run build                          # compiles src/ -> build/

# register with Claude Code (run from your home dir or anywhere)
claude mcp add tlw-buffer -- node /absolute/path/to/mcp-servers/buffer/build/index.js
```

Then restart Claude Code so the server gets picked up.

---

## Prereqs

1. **Node 20+** (verified on 22.x).
2. **A Buffer personal API key** generated at
   <https://publish.buffer.com> -> Settings -> API. Only an organization owner
   can mint one. Treat it like a password.
3. **Channel IDs** for each connected account. The `list-channels` script
   prints these and even suggests a `config.channels` block you can paste.

---

## Configuration

`config.json` lives next to this README and is gitignored. Shape:

```json
{
  "buffer_api_key": "sk_buf_...",
  "channels": {
    "linkedin": "<id>",
    "facebook": "<id>",
    "instagram": "<id>"
  },
  "default_schedule": {
    "linkedin": ["Tue 07:00", "Wed 07:00", "Thu 07:00"],
    "facebook": ["Tue 07:30", "Wed 07:30", "Thu 07:30"],
    "instagram": ["Wed 08:00"]
  },
  "timezone": "America/Los_Angeles",
  "metrics_log_path": "./metrics.csv"
}
```

The channel keys (`linkedin`, `facebook`, `instagram`) are aliases. Anywhere a
tool wants a `channel`, you can pass either the alias or the raw Buffer
channel ID.

`BUFFER_API_KEY` env var overrides `buffer_api_key` from JSON (handy for CI).

---

## MCP tools exposed

| Tool | What it does |
|---|---|
| `list_channels` | Returns connected Buffer channels and their IDs. |
| `create_post` | Single-channel post. Modes: `queue` (next Buffer slot) or `scheduled` (specific time or next default slot). |
| `create_multi_channel_post` | Same content (or per-channel variants) across multiple channels in one call. |
| `list_pending_posts` | What's queued. Optional `channel` filter. |
| `delete_post` | Remove a queued post by id. |

Instagram requires `media`; the server errors out cleanly if none is provided.

---

## Verifying before you go live

Buffer's GraphQL API is in public beta and the **legacy `assets` input format
expires May 25, 2026**. This server's `client.ts` was written from the build
brief. Before the first production send, run the introspection script and
diff against the queries in `src/buffer/client.ts`:

```bash
BUFFER_API_KEY=sk_buf_... npm run introspect > schema.json
```

If `CreatePostInput` / `AssetInput` names differ, update the GraphQL strings
in `src/buffer/client.ts` (they're inline in each method).

---

## Metrics

Every successful post appends a row to `metrics.csv`:

```
timestamp,channel,post_id,scheduled_for,text_preview
```

This is the LinkedIn-posts-made metric for the weekly dashboard. The path is
configurable via `metrics_log_path`.

---

## Brand voice

Voice rules from the brief are baked into the server's MCP instructions so
Claude picks them up on first turn:

- Gratitude-led, radically concise, warmly direct
- LinkedIn long-form sign-off: *"Gratefully,"*
- AI-related posts include `#AIforLeaders`
- Instagram only if image provided

See `src/voice.ts` to tweak.

---

## Folder layout

```
mcp-servers/buffer/
  config.example.json         template (committed)
  config.json                 your real config (gitignored)
  src/
    index.ts                  MCP server + tool wiring
    config.ts                 config loader + channel alias resolver
    schedule.ts               default-schedule -> ISO datetime math (luxon)
    metrics.ts                CSV append
    voice.ts                  brand voice guidance string
    buffer/
      client.ts               GraphQL client + queries
      types.ts                shared TS types
  scripts/
    list-channels.mjs         Phase 1 sanity check (no compile needed)
    introspect.mjs            schema introspection before going live
  build/                      tsc output (gitignored)
```

---

## Future: rolling into the coaching app

When this graduates into the TLW coaching app, the natural seam is
`src/buffer/client.ts` + `src/schedule.ts` + `src/metrics.ts`. They have no
MCP dependency and can be imported directly into Next.js route handlers. The
MCP layer (`src/index.ts`) becomes optional rather than the only entry point.

---

## Known caveats (from the brief)

- Buffer API is in public beta. Schema can shift. Re-run `introspect` if
  things start failing.
- Personal API key is user-scoped. Regenerate at publish.buffer.com if lost.
- Rate limits are per-plan; client retries 429 / 5xx with exponential backoff
  (2s -> 4s -> 8s -> 16s).
- MCP stdio servers must be restarted in Claude Code after config changes:
  `claude mcp remove tlw-buffer` then `claude mcp add` again, or restart the
  CLI.

Gratefully,
Jeff
