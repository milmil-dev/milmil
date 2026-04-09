# Interactive Bot Commands — Design Spec

**Date:** 2026-04-09
**Status:** Approved
**Scope:** Phase 1 — Telegram + Discord interactive bot with enriched notifications

## Summary

Turn the existing one-way notification push into a full interactive bot for both Telegram and Discord. Users can browse anime schedules, search, manage downloads, subscribe to auto-downloads, and monitor their system — all from their messaging app. Notifications are enriched with anime metadata, cover images, and action buttons.

## Architecture: Unified Bot Engine

```
┌─────────────┐    ┌─────────────┐
│  Telegram    │    │  Discord    │
│  Adapter     │    │  Adapter    │
└──────┬───────┘    └──────┬──────┘
       │                   │
       └───────┬───────────┘
               ▼
       ┌───────────────┐
       │  Bot Router   │  ← parses command + args
       └───────┬───────┘
               ▼
       ┌───────────────┐
       │  Command       │  ← platform-agnostic handlers
       │  Handlers      │     return BotResponse
       └───────┬───────┘
               ▼
       ┌───────────────┐
       │  Renderer      │  ← formats per platform
       │  (tg / discord)│
       └───────────────┘
```

Commands are platform-agnostic. Each handler returns a structured `BotResponse`. Platform adapters render to Telegram (inline keyboards, HTML, photos) or Discord (embeds, action rows, components).

## BotResponse Model

```go
type BotResponse struct {
    Text     string        // main message body
    ImageURL string        // optional cover/banner image
    Fields   []BotField    // key-value pairs
    Buttons  [][]BotButton // rows of inline buttons
    List     []BotListItem // for lists (search results, downloads)
}

type BotField struct {
    Label  string
    Value  string
    Inline bool
}

type BotButton struct {
    Label string
    Data  string // callback data (e.g. "subscribe:552589")
    URL   string // external link (mutually exclusive with Data)
}

type BotListItem struct {
    Title    string
    Subtitle string
    ImageURL string
    Buttons  []BotButton
}
```

**Telegram rendering:**
- Text → HTML (`<b>`, `<i>`, `<code>`)
- ImageURL → `sendPhoto` with caption
- Fields → `<b>Label:</b> Value` lines
- Buttons → `InlineKeyboardMarkup` rows
- Lists → numbered items with buttons per item
- Pagination → [← Prev] [Page 2/5] [Next →]

**Discord rendering:**
- Text → Embed description
- ImageURL → Embed thumbnail
- Fields → Embed fields (inline support)
- Buttons → ActionRow Button components
- Lists → multiple embeds or numbered fields
- Pagination → Button components

## Phase 1 Commands (9 total)

| Command | Description | Data Source |
|---|---|---|
| `/start` | Welcome message + command list | Static |
| `/schedule` | Weekly airing schedule grouped by day | `discover/calendar` |
| `/search <query>` | Search anime, top 5 with [Detail] [Subscribe] buttons | `discover/search` |
| `/detail <id>` | Anime card: cover, score, synopsis, episodes, genres | `discover/anime/{id}` |
| `/downloads` | Active downloads with progress, [Pause] [Cancel] buttons | `downloads/grouped` |
| `/subscribe <anime>` | Quick subscribe with source picker (Mikan/Nyaa/DMHY) | `POST /subscribe` |
| `/status` | System overview: downloads, disk, engine health, feeds | Multiple endpoints |
| `/mylist [status]` | Collection list (default: watching), paginated | `collection` |
| `/continue` | Recently watched with progress bars | `progress/recent` |

### Callback Handling

Inline button taps (e.g. [Subscribe] on search result) route through callback data:
- `detail:<bangumi_id>` → show anime detail card
- `subscribe:<bangumi_id>:<source>` → execute subscribe
- `dl_pause:<gid>` → pause download
- `dl_cancel:<gid>` → cancel download
- `page:<command>:<offset>` → pagination

Callbacks update the original message in-place (Telegram `editMessageText`, Discord `interaction.update`).

## Enriched Notifications

Upgrade existing push notifications with anime metadata and action buttons.

**Before (plain):**
```
✅ Download Complete
[LoliHouse] 迦楠大人的白给是恶魔级 - 01 [WebRip 1080p HEVC-10bit AAC]
```

**After (enriched):**
```
✅ Download Complete
迦楠大人的白给是恶魔级 — EP01
LoliHouse · 1080p · 649MB
[cover image thumbnail]
[Scan Library] [View Anime]
```

**Enrichment process:**
1. On `download.completed`/`download.started`, look up `bangumi_id` from download record
2. Fetch anime detail from metadata service (cached) for title + cover
3. Parse episode number via `rss.ParseEpisode`, subgroup via `rss.ParseSubgroup`
4. Build `BotResponse` with image, fields, buttons
5. Platform adapters render natively

**All notification events enriched:**

| Event | Enrichment |
|---|---|
| `download.started` | Anime name, episode, subgroup, cover |
| `download.completed` | Same + file size + [Scan Library] button |
| `download.failed` | Same + error message + [Retry] button |
| `library.scan_complete` | Library name, files found/matched |
| `system.error` | Worker name, error detail |

## Platform Adapters

### Telegram Adapter

**Transport — auto-switching:**
- Default: long polling via `getUpdates` (30s timeout)
- If `webhook_url` configured in settings: registers webhook via `setWebhook`, listens on `POST /api/v1/bot/telegram/webhook`
- Auto-switches on settings change: webhook_url present → register + stop polling; removed → delete webhook + start polling
- No server restart needed

**On startup:** Calls `setMyCommands` to register all Phase 1 commands in Telegram's command menu.

### Discord Adapter

**Transport:** Discord Gateway (websocket) via `bwmarrin/discordgo`

**On startup:** Bulk registers slash commands via `PUT /applications/{app}/commands` with parameter definitions (e.g. `/search` has required `query` string param).

### Webhook endpoint

```
POST /api/v1/bot/telegram/webhook
```

Discord uses gateway websocket, no webhook endpoint needed.

## Authentication

**Shared internal API token.** Stored in settings table under `bot` config. Bot handlers call existing services directly (same process), no HTTP round-trip. The bot goroutine has access to the same `store.Queries`, `metadata.Service`, `downloader.Manager`, etc. as the API handlers.

**Authorization:** Only respond to commands from `allowed_chat_ids` (Telegram) or `allowed_guild_ids` (Discord). Empty = only the configured chat_id.

## Configuration

Extends notification settings with bot config:

```json
{
  "providers": { ... },
  "events": { ... },
  "bot": {
    "telegram": {
      "enabled": false,
      "bot_token": "",
      "webhook_url": "",
      "allowed_chat_ids": []
    },
    "discord": {
      "enabled": false,
      "bot_token": "",
      "application_id": "",
      "allowed_guild_ids": []
    }
  }
}
```

**Key points:**
- Bot config is separate from notification push config — independent features
- Telegram bot_token can be shared with notification push (same bot) or separate
- Bot goroutines start/stop on settings change without server restart
- `allowed_chat_ids` / `allowed_guild_ids` for authorization

**Frontend:** New "Bot Commands" section in the Notifications settings tab, below existing provider cards. Toggle, credentials, test button.

## Go Libraries

- **Telegram:** `github.com/go-telegram-bot-api/telegram-bot-api/v5` — mature, inline keyboards, photos, webhooks, long polling, callbacks
- **Discord:** `github.com/bwmarrin/discordgo` — slash commands, embeds, components, gateway

Both lightweight, no CGO.

## File Structure

```
api/internal/bot/
├── bot.go              # BotResponse types, Command interface, Router
├── commands/
│   ├── start.go        # /start welcome
│   ├── schedule.go     # /schedule weekly airing
│   ├── search.go       # /search + callback for detail/subscribe
│   ├── detail.go       # /detail anime card
│   ├── downloads.go    # /downloads + pause/cancel callbacks
│   ├── subscribe.go    # /subscribe with source picker
│   ├── status.go       # /status system overview
│   ├── mylist.go       # /mylist collection
│   └── continue.go     # /continue recently watched
├── telegram/
│   ├── adapter.go      # Polling + webhook transport
│   └── renderer.go     # BotResponse → Telegram messages
└── discord/
    ├── adapter.go      # Gateway + slash command registration
    └── renderer.go     # BotResponse → Discord embeds
```

## Wiring

Bot engine starts as a goroutine alongside existing workers in `main.go`:
- Load bot config from settings
- If Telegram enabled: start Telegram adapter goroutine
- If Discord enabled: start Discord adapter goroutine
- Both share the same command router and service dependencies
- Graceful shutdown via context cancellation (same pattern as existing scheduler)

## Non-Goals (Phase 1)

- Inline queries (Telegram `@bot query`)
- Multi-user support (single-user self-hosted)
- Streaming/playback from bot
- Natural language / AI chat
- Rate limiting
- Phase 2 discovery commands (`/trending`, `/recommend`, `/seasonal`, `/genre`, `/tags`)
- Phase 3 interactive features (inline queries, advanced button flows)
