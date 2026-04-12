# Interactive Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add interactive Telegram + Discord bot with 9 commands, enriched notifications, and inline button callbacks.

**Architecture:** Unified bot engine — platform-agnostic command handlers return `BotResponse`, platform adapters (Telegram/Discord) render natively. Bot goroutines run alongside existing workers, sharing the same service dependencies. Telegram supports auto-switching between polling and webhook.

**Tech Stack:** Go, `go-telegram-bot-api/v5`, `bwmarrin/discordgo`, existing metadata/store/downloader services

---

### Task 1: Go Dependencies

**Files:**
- Modify: `api/go.mod`

- [ ] **Step 1: Add Telegram and Discord libraries**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/api
go get github.com/go-telegram-bot-api/telegram-bot-api/v5@latest
go get github.com/bwmarrin/discordgo@latest
```

- [ ] **Step 2: Verify build**

Run: `go build ./cmd/server`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add go.mod go.sum
git commit -m "deps: add telegram-bot-api and discordgo"
```

---

### Task 2: Bot Config Types

**Files:**
- Modify: `api/internal/notification/config.go`

- [ ] **Step 1: Add BotConfig types to config.go**

Add after the `NotificationConfig` struct:

```go
// TelegramBotConfig holds interactive Telegram bot settings.
type TelegramBotConfig struct {
	Enabled       bool     `json:"enabled"`
	BotToken      string   `json:"bot_token"`
	WebhookURL    string   `json:"webhook_url"`
	AllowedChatIDs []int64 `json:"allowed_chat_ids"`
}

// DiscordBotConfig holds interactive Discord bot settings.
type DiscordBotConfig struct {
	Enabled         bool     `json:"enabled"`
	BotToken        string   `json:"bot_token"`
	ApplicationID   string   `json:"application_id"`
	AllowedGuildIDs []string `json:"allowed_guild_ids"`
}

// BotConfig groups all interactive bot settings.
type BotConfig struct {
	Telegram TelegramBotConfig `json:"telegram"`
	Discord  DiscordBotConfig  `json:"discord"`
}
```

Add `Bot` field to `NotificationConfig`:

```go
type NotificationConfig struct {
	Providers ProvidersConfig     `json:"providers"`
	Events    map[string][]string `json:"events"`
	Bot       BotConfig           `json:"bot"`
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./cmd/server`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add api/internal/notification/config.go
git commit -m "feat(bot): add bot config types to notification config"
```

---

### Task 3: BotResponse Types and Command Router

**Files:**
- Create: `api/internal/bot/bot.go`

- [ ] **Step 1: Create bot.go with types and router**

```go
// api/internal/bot/bot.go
package bot

import "context"

// BotResponse is the platform-agnostic response from a command handler.
type BotResponse struct {
	Text     string        `json:"text"`
	ImageURL string        `json:"image_url,omitempty"`
	Fields   []BotField    `json:"fields,omitempty"`
	Buttons  [][]BotButton `json:"buttons,omitempty"`
	List     []BotListItem `json:"list,omitempty"`
}

// BotField is a key-value pair displayed in the response.
type BotField struct {
	Label  string `json:"label"`
	Value  string `json:"value"`
	Inline bool   `json:"inline"`
}

// BotButton is an inline button. Set Data for callbacks, URL for links.
type BotButton struct {
	Label string `json:"label"`
	Data  string `json:"data,omitempty"`
	URL   string `json:"url,omitempty"`
}

// BotListItem is a single item in a list response.
type BotListItem struct {
	Title    string      `json:"title"`
	Subtitle string      `json:"subtitle,omitempty"`
	ImageURL string      `json:"image_url,omitempty"`
	Buttons  []BotButton `json:"buttons,omitempty"`
}

// CommandContext holds the parsed command invocation.
type CommandContext struct {
	Command  string   // e.g. "search"
	Args     string   // raw args string after command
	ChatID   int64    // Telegram chat ID or Discord channel snowflake as int64
	Platform string   // "telegram" or "discord"
}

// CallbackContext holds a button callback invocation.
type CallbackContext struct {
	Data     string
	ChatID   int64
	MessageID int
	Platform string
}

// CommandHandler processes a command and returns a response.
type CommandHandler func(ctx context.Context, cmd CommandContext) (*BotResponse, error)

// CallbackHandler processes a button callback and returns a response.
type CallbackHandler func(ctx context.Context, cb CallbackContext) (*BotResponse, error)

// Router dispatches commands and callbacks to handlers.
type Router struct {
	commands  map[string]CommandHandler
	callbacks map[string]CallbackHandler // keyed by prefix (e.g. "detail", "subscribe")
}

// NewRouter creates an empty command router.
func NewRouter() *Router {
	return &Router{
		commands:  make(map[string]CommandHandler),
		callbacks: make(map[string]CallbackHandler),
	}
}

// RegisterCommand adds a command handler.
func (r *Router) RegisterCommand(name string, handler CommandHandler) {
	r.commands[name] = handler
}

// RegisterCallback adds a callback handler keyed by prefix.
// Callback data format: "prefix:arg1:arg2"
func (r *Router) RegisterCallback(prefix string, handler CallbackHandler) {
	r.callbacks[prefix] = handler
}

// HandleCommand dispatches to the registered handler.
func (r *Router) HandleCommand(ctx context.Context, cmd CommandContext) (*BotResponse, error) {
	handler, ok := r.commands[cmd.Command]
	if !ok {
		return &BotResponse{Text: "Unknown command. Send /start for help."}, nil
	}
	return handler(ctx, cmd)
}

// HandleCallback dispatches to the registered callback handler.
// Extracts prefix from "prefix:rest" data format.
func (r *Router) HandleCallback(ctx context.Context, cb CallbackContext) (*BotResponse, error) {
	prefix := cb.Data
	if i := indexOf(cb.Data, ':'); i >= 0 {
		prefix = cb.Data[:i]
	}
	handler, ok := r.callbacks[prefix]
	if !ok {
		return &BotResponse{Text: "Unknown action."}, nil
	}
	return handler(ctx, cb)
}

func indexOf(s string, c byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == c {
			return i
		}
	}
	return -1
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./cmd/server`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add api/internal/bot/
git commit -m "feat(bot): add BotResponse types and command router"
```

---

### Task 4: Command Handlers — Services Container

**Files:**
- Create: `api/internal/bot/commands/services.go`

Command handlers need access to existing services. Create a shared services container.

- [ ] **Step 1: Create services container**

```go
// api/internal/bot/commands/services.go
package commands

import (
	"github.com/milmil/api/internal/downloader"
	"github.com/milmil/api/internal/metadata"
	"github.com/milmil/api/internal/store"
)

// Services holds shared dependencies for all command handlers.
type Services struct {
	Queries    *store.Queries
	Metadata   *metadata.Service
	Downloader downloader.Manager
}
```

- [ ] **Step 2: Commit**

```bash
git add api/internal/bot/commands/
git commit -m "feat(bot): add command services container"
```

---

### Task 5: Command Handlers — /start, /status

**Files:**
- Create: `api/internal/bot/commands/start.go`
- Create: `api/internal/bot/commands/status.go`

- [ ] **Step 1: Implement /start**

```go
// api/internal/bot/commands/start.go
package commands

import (
	"context"

	"github.com/milmil/api/internal/bot"
)

func StartHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		return &bot.BotResponse{
			Text: "<b>milmil</b> — Anime Media Server\n\n" +
				"/schedule — Weekly airing schedule\n" +
				"/search <query> — Search anime\n" +
				"/detail <id> — Anime details\n" +
				"/downloads — Active downloads\n" +
				"/subscribe <anime> — Auto-download subscription\n" +
				"/status — System overview\n" +
				"/mylist [status] — Your collection\n" +
				"/continue — Recently watched",
		}, nil
	}
}
```

- [ ] **Step 2: Implement /status**

```go
// api/internal/bot/commands/status.go
package commands

import (
	"context"
	"fmt"

	"github.com/milmil/api/internal/bot"
)

func StatusHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		// Count active downloads
		downloads, _ := svc.Queries.ListActiveDownloads(ctx)
		activeCount := len(downloads)

		// Count RSS feeds
		feeds, _ := svc.Queries.ListRSSFeeds(ctx)
		feedCount := len(feeds)

		// Count download rules
		rules, _ := svc.Queries.ListDownloadRules(ctx)
		ruleCount := len(rules)

		// Downloader status
		engineStatus := "connected"
		if svc.Downloader == nil {
			engineStatus = "disconnected"
		}

		return &bot.BotResponse{
			Text: "📊 <b>System Status</b>",
			Fields: []bot.BotField{
				{Label: "Engine", Value: engineStatus, Inline: true},
				{Label: "Active Downloads", Value: fmt.Sprintf("%d", activeCount), Inline: true},
				{Label: "RSS Feeds", Value: fmt.Sprintf("%d", feedCount), Inline: true},
				{Label: "Download Rules", Value: fmt.Sprintf("%d", ruleCount), Inline: true},
			},
		}, nil
	}
}
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./cmd/server`

- [ ] **Step 4: Commit**

```bash
git add api/internal/bot/commands/
git commit -m "feat(bot): add /start and /status command handlers"
```

---

### Task 6: Command Handlers — /schedule, /search, /detail

**Files:**
- Create: `api/internal/bot/commands/schedule.go`
- Create: `api/internal/bot/commands/search.go`
- Create: `api/internal/bot/commands/detail.go`

- [ ] **Step 1: Implement /schedule**

```go
// api/internal/bot/commands/schedule.go
package commands

import (
	"context"
	"fmt"
	"strings"

	"github.com/milmil/api/internal/bot"
)

var weekdayNames = []string{"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}

func ScheduleHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		calendar, err := svc.Metadata.GetCalendar(ctx)
		if err != nil {
			return &bot.BotResponse{Text: "Failed to load schedule."}, nil
		}

		var sb strings.Builder
		sb.WriteString("<b>📅 Weekly Schedule</b>\n")

		for _, day := range calendar {
			if len(day.Items) == 0 {
				continue
			}
			dayName := day.Weekday
			if day.Weekday == "" && day.WeekdayID > 0 && day.WeekdayID <= 7 {
				dayName = weekdayNames[day.WeekdayID-1]
			}
			sb.WriteString(fmt.Sprintf("\n<b>%s</b>\n", dayName))
			for _, item := range day.Items {
				title := item.Title
				if title == "" {
					title = item.TitleOriginal
				}
				airTime := ""
				if item.AirTime != "" {
					airTime = " " + item.AirTime
				}
				sb.WriteString(fmt.Sprintf("  • %s%s\n", title, airTime))
			}
		}

		return &bot.BotResponse{Text: sb.String()}, nil
	}
}
```

- [ ] **Step 2: Implement /search**

```go
// api/internal/bot/commands/search.go
package commands

import (
	"context"
	"fmt"
	"strings"

	"github.com/milmil/api/internal/bot"
)

func SearchHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		query := strings.TrimSpace(cmd.Args)
		if query == "" {
			return &bot.BotResponse{Text: "Usage: /search <anime name>"}, nil
		}

		results, err := svc.Metadata.Search(ctx, query, false)
		if err != nil {
			return &bot.BotResponse{Text: "Search failed."}, nil
		}

		if len(results) == 0 {
			return &bot.BotResponse{Text: fmt.Sprintf("No results for \"%s\".", query)}, nil
		}

		// Limit to 5 results
		if len(results) > 5 {
			results = results[:5]
		}

		items := make([]bot.BotListItem, 0, len(results))
		for _, r := range results {
			title := r.Title
			if title == "" {
				title = r.TitleOriginal
			}
			subtitle := ""
			if r.Score > 0 {
				subtitle = fmt.Sprintf("⭐ %.1f", r.Score)
			}
			if r.AirDate != "" {
				if subtitle != "" {
					subtitle += " · "
				}
				subtitle += r.AirDate[:4]
			}

			items = append(items, bot.BotListItem{
				Title:    title,
				Subtitle: subtitle,
				ImageURL: r.CoverImage,
				Buttons: []bot.BotButton{
					{Label: "Detail", Data: fmt.Sprintf("detail:%d", r.BangumiID)},
					{Label: "Subscribe", Data: fmt.Sprintf("sub_pick:%d", r.BangumiID)},
				},
			})
		}

		return &bot.BotResponse{
			Text: fmt.Sprintf("🔍 Results for \"%s\":", query),
			List: items,
		}, nil
	}
}
```

- [ ] **Step 3: Implement /detail**

```go
// api/internal/bot/commands/detail.go
package commands

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/milmil/api/internal/bot"
)

func DetailHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		idStr := strings.TrimSpace(cmd.Args)
		id, err := strconv.Atoi(idStr)
		if err != nil || id <= 0 {
			return &bot.BotResponse{Text: "Usage: /detail <bangumi_id>"}, nil
		}

		return buildDetailResponse(ctx, svc, id)
	}
}

// DetailCallback handles the "detail:<id>" callback from inline buttons.
func DetailCallback(svc *Services) bot.CallbackHandler {
	return func(ctx context.Context, cb bot.CallbackContext) (*bot.BotResponse, error) {
		// Parse "detail:<id>"
		parts := strings.SplitN(cb.Data, ":", 2)
		if len(parts) < 2 {
			return &bot.BotResponse{Text: "Invalid detail callback."}, nil
		}
		id, err := strconv.Atoi(parts[1])
		if err != nil {
			return &bot.BotResponse{Text: "Invalid anime ID."}, nil
		}
		return buildDetailResponse(ctx, svc, id)
	}
}

func buildDetailResponse(ctx context.Context, svc *Services, bangumiID int) (*bot.BotResponse, error) {
	detail, err := svc.Metadata.GetAnimeDetail(ctx, bangumiID)
	if err != nil {
		return &bot.BotResponse{Text: "Failed to load anime details."}, nil
	}

	title := detail.Title
	if title == "" {
		title = detail.TitleOriginal
	}

	// Build synopsis (truncate to 300 chars)
	synopsis := detail.Synopsis
	if len(synopsis) > 300 {
		synopsis = synopsis[:297] + "..."
	}

	// Genres
	genres := ""
	if len(detail.Genres) > 0 {
		genreNames := make([]string, 0, len(detail.Genres))
		for _, g := range detail.Genres {
			genreNames = append(genreNames, g.Name)
		}
		genres = strings.Join(genreNames, ", ")
	}

	fields := []bot.BotField{}
	if detail.Score > 0 {
		fields = append(fields, bot.BotField{Label: "Score", Value: fmt.Sprintf("⭐ %.1f", detail.Score), Inline: true})
	}
	if detail.EpisodeCount > 0 {
		fields = append(fields, bot.BotField{Label: "Episodes", Value: fmt.Sprintf("%d", detail.EpisodeCount), Inline: true})
	}
	if detail.AirDate != "" {
		fields = append(fields, bot.BotField{Label: "Air Date", Value: detail.AirDate, Inline: true})
	}
	if genres != "" {
		fields = append(fields, bot.BotField{Label: "Genres", Value: genres})
	}

	text := fmt.Sprintf("<b>%s</b>", title)
	if detail.TitleOriginal != "" && detail.TitleOriginal != title {
		text += fmt.Sprintf("\n<i>%s</i>", detail.TitleOriginal)
	}
	if synopsis != "" {
		text += fmt.Sprintf("\n\n%s", synopsis)
	}

	return &bot.BotResponse{
		Text:     text,
		ImageURL: detail.CoverImage,
		Fields:   fields,
		Buttons: [][]bot.BotButton{
			{
				{Label: "Subscribe", Data: fmt.Sprintf("sub_pick:%d", bangumiID)},
				{Label: "Bangumi", URL: fmt.Sprintf("https://bgm.tv/subject/%d", bangumiID)},
			},
		},
	}, nil
}
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./cmd/server`

- [ ] **Step 5: Commit**

```bash
git add api/internal/bot/commands/
git commit -m "feat(bot): add /schedule, /search, /detail command handlers"
```

---

### Task 7: Command Handlers — /downloads, /subscribe, /mylist, /continue

**Files:**
- Create: `api/internal/bot/commands/downloads.go`
- Create: `api/internal/bot/commands/subscribe.go`
- Create: `api/internal/bot/commands/mylist.go`
- Create: `api/internal/bot/commands/continue.go`

- [ ] **Step 1: Implement /downloads**

```go
// api/internal/bot/commands/downloads.go
package commands

import (
	"context"
	"fmt"
	"strings"

	"github.com/milmil/api/internal/bot"
)

func DownloadsHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		downloads, err := svc.Queries.ListActiveDownloads(ctx)
		if err != nil {
			return &bot.BotResponse{Text: "Failed to load downloads."}, nil
		}

		if len(downloads) == 0 {
			return &bot.BotResponse{Text: "No active downloads."}, nil
		}

		items := make([]bot.BotListItem, 0, len(downloads))
		for _, dl := range downloads {
			// Progress bar
			pct := 0.0
			if dl.TotalBytes > 0 {
				pct = float64(dl.CompletedBytes) / float64(dl.TotalBytes) * 100
			}
			bar := progressBar(pct, 10)

			subtitle := fmt.Sprintf("%s %.0f%%", bar, pct)
			if dl.SpeedBytes > 0 {
				subtitle += fmt.Sprintf(" · %s/s", formatBytes(dl.SpeedBytes))
			}

			buttons := []bot.BotButton{}
			if dl.Status == "active" {
				buttons = append(buttons, bot.BotButton{Label: "⏸ Pause", Data: fmt.Sprintf("dl_pause:%s", dl.Gid)})
			} else if dl.Status == "paused" {
				buttons = append(buttons, bot.BotButton{Label: "▶ Resume", Data: fmt.Sprintf("dl_resume:%s", dl.Gid)})
			}
			buttons = append(buttons, bot.BotButton{Label: "✕ Cancel", Data: fmt.Sprintf("dl_cancel:%s", dl.Gid)})

			// Truncate name
			name := dl.Name
			if len(name) > 60 {
				name = name[:57] + "..."
			}

			items = append(items, bot.BotListItem{
				Title:    name,
				Subtitle: subtitle,
				Buttons:  buttons,
			})
		}

		return &bot.BotResponse{
			Text: fmt.Sprintf("📥 <b>Active Downloads</b> (%d)", len(downloads)),
			List: items,
		}, nil
	}
}

// DownloadControlCallback handles dl_pause, dl_resume, dl_cancel callbacks.
func DownloadControlCallback(svc *Services) bot.CallbackHandler {
	return func(ctx context.Context, cb bot.CallbackContext) (*bot.BotResponse, error) {
		parts := strings.SplitN(cb.Data, ":", 2)
		if len(parts) < 2 {
			return &bot.BotResponse{Text: "Invalid action."}, nil
		}
		action, gid := parts[0], parts[1]

		switch action {
		case "dl_pause":
			if err := svc.Downloader.Pause(ctx, gid); err != nil {
				return &bot.BotResponse{Text: fmt.Sprintf("Failed to pause: %v", err)}, nil
			}
			return &bot.BotResponse{Text: "⏸ Download paused."}, nil
		case "dl_resume":
			if err := svc.Downloader.Resume(ctx, gid); err != nil {
				return &bot.BotResponse{Text: fmt.Sprintf("Failed to resume: %v", err)}, nil
			}
			return &bot.BotResponse{Text: "▶ Download resumed."}, nil
		case "dl_cancel":
			if err := svc.Downloader.Remove(ctx, gid, true); err != nil {
				return &bot.BotResponse{Text: fmt.Sprintf("Failed to cancel: %v", err)}, nil
			}
			return &bot.BotResponse{Text: "✕ Download cancelled."}, nil
		}
		return &bot.BotResponse{Text: "Unknown action."}, nil
	}
}

func progressBar(pct float64, width int) string {
	filled := int(pct / 100 * float64(width))
	if filled > width {
		filled = width
	}
	return strings.Repeat("█", filled) + strings.Repeat("░", width-filled)
}

func formatBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}
```

- [ ] **Step 2: Implement /subscribe**

```go
// api/internal/bot/commands/subscribe.go
package commands

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/milmil/api/internal/bot"
	"github.com/milmil/api/internal/store"
)

// SubscribeHandler handles /subscribe <query> — searches and shows source picker.
func SubscribeHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		query := strings.TrimSpace(cmd.Args)
		if query == "" {
			return &bot.BotResponse{Text: "Usage: /subscribe <anime name>"}, nil
		}

		results, err := svc.Metadata.Search(ctx, query, false)
		if err != nil || len(results) == 0 {
			return &bot.BotResponse{Text: fmt.Sprintf("No anime found for \"%s\".", query)}, nil
		}

		// Use first result
		anime := results[0]
		title := anime.Title
		if title == "" {
			title = anime.TitleOriginal
		}

		return &bot.BotResponse{
			Text:     fmt.Sprintf("Subscribe to <b>%s</b>?\nPick RSS source:", title),
			ImageURL: anime.CoverImage,
			Buttons: [][]bot.BotButton{
				{
					{Label: "Mikan", Data: fmt.Sprintf("sub_do:%d:mikan", anime.BangumiID)},
					{Label: "Nyaa", Data: fmt.Sprintf("sub_do:%d:nyaa", anime.BangumiID)},
					{Label: "DMHY", Data: fmt.Sprintf("sub_do:%d:dmhy", anime.BangumiID)},
				},
			},
		}, nil
	}
}

// SubscribePickCallback handles "sub_pick:<id>" — show source picker for a known anime.
func SubscribePickCallback(svc *Services) bot.CallbackHandler {
	return func(ctx context.Context, cb bot.CallbackContext) (*bot.BotResponse, error) {
		parts := strings.SplitN(cb.Data, ":", 2)
		if len(parts) < 2 {
			return &bot.BotResponse{Text: "Invalid callback."}, nil
		}
		id, err := strconv.Atoi(parts[1])
		if err != nil {
			return &bot.BotResponse{Text: "Invalid anime ID."}, nil
		}

		detail, err := svc.Metadata.GetAnimeDetail(ctx, id)
		if err != nil {
			return &bot.BotResponse{Text: "Failed to load anime."}, nil
		}
		title := detail.Title
		if title == "" {
			title = detail.TitleOriginal
		}

		return &bot.BotResponse{
			Text: fmt.Sprintf("Subscribe to <b>%s</b>?\nPick RSS source:", title),
			Buttons: [][]bot.BotButton{
				{
					{Label: "Mikan", Data: fmt.Sprintf("sub_do:%d:mikan", id)},
					{Label: "Nyaa", Data: fmt.Sprintf("sub_do:%d:nyaa", id)},
					{Label: "DMHY", Data: fmt.Sprintf("sub_do:%d:dmhy", id)},
				},
			},
		}, nil
	}
}

// SubscribeDoCallback handles "sub_do:<id>:<source>" — executes the subscription.
func SubscribeDoCallback(svc *Services) bot.CallbackHandler {
	return func(ctx context.Context, cb bot.CallbackContext) (*bot.BotResponse, error) {
		// Parse "sub_do:<bangumi_id>:<source>"
		parts := strings.SplitN(cb.Data, ":", 3)
		if len(parts) < 3 {
			return &bot.BotResponse{Text: "Invalid subscribe callback."}, nil
		}
		bangumiID, err := strconv.Atoi(parts[1])
		if err != nil {
			return &bot.BotResponse{Text: "Invalid anime ID."}, nil
		}
		source := parts[2]

		detail, err := svc.Metadata.GetAnimeDetail(ctx, bangumiID)
		if err != nil {
			return &bot.BotResponse{Text: "Failed to load anime details."}, nil
		}

		title := detail.Title
		if title == "" {
			title = detail.TitleOriginal
		}

		// Find first library as default save location
		libraries, _ := svc.Queries.ListLibraries(ctx)
		var libraryID sql.NullString
		var saveDir string
		if len(libraries) > 0 {
			libraryID = sql.NullString{String: libraries[0].ID, Valid: true}
			saveDir = libraries[0].Path
		}

		// Build RSS URL
		var feedURL string
		switch source {
		case "mikan":
			feedURL = fmt.Sprintf("https://mikanani.me/RSS/Search?searchstr=%s", title)
		case "nyaa":
			query := detail.TitleEN
			if query == "" {
				query = detail.TitleOriginal
			}
			feedURL = fmt.Sprintf("https://nyaa.si/?page=rss&q=%s&c=1_0&f=0", query)
		case "dmhy":
			feedURL = fmt.Sprintf("https://share.dmhy.org/topics/rss/rss.xml?keyword=%s", title)
		default:
			return &bot.BotResponse{Text: "Unknown source."}, nil
		}

		// Create feed
		feed, err := svc.Queries.CreateRSSFeed(ctx, store.CreateRSSFeedParams{
			ID:                   uuid.NewString(),
			Name:                 fmt.Sprintf("[Bot] %s", title),
			Url:                  feedURL,
			Type:                 source,
			Enabled:              1,
			FetchIntervalMinutes: 30,
		})
		if err != nil {
			return &bot.BotResponse{Text: "Failed to create RSS feed."}, nil
		}

		// Create rule
		filterRegex := fmt.Sprintf("(?i)%s", title)
		_, err = svc.Queries.CreateDownloadRule(ctx, store.CreateDownloadRuleParams{
			ID:          uuid.NewString(),
			Name:        title,
			Enabled:     1,
			RssFeedID:   feed.ID,
			FilterRegex: filterRegex,
			SaveDir:     saveDir,
			LibraryID:   libraryID,
			BangumiID:   sql.NullInt64{Int64: int64(bangumiID), Valid: true},
			MatchMode:   "fuzzy",
			EpisodeFilter: "all",
		})
		if err != nil {
			_ = svc.Queries.DeleteRSSFeed(ctx, feed.ID)
			return &bot.BotResponse{Text: "Failed to create download rule."}, nil
		}

		return &bot.BotResponse{
			Text: fmt.Sprintf("✅ Subscribed to <b>%s</b>\nSource: %s\nNew episodes will download automatically.", title, source),
		}, nil
	}
}
```

- [ ] **Step 3: Implement /mylist**

```go
// api/internal/bot/commands/mylist.go
package commands

import (
	"context"
	"fmt"
	"strings"

	"github.com/milmil/api/internal/bot"
)

func MyListHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		statusFilter := strings.TrimSpace(cmd.Args)
		if statusFilter == "" {
			statusFilter = "watching"
		}

		collection, err := svc.Queries.ListCollection(ctx, statusFilter)
		if err != nil {
			return &bot.BotResponse{Text: "Failed to load collection."}, nil
		}

		if len(collection) == 0 {
			return &bot.BotResponse{
				Text: fmt.Sprintf("No anime in your <b>%s</b> list.", statusFilter),
			}, nil
		}

		// Limit to 10
		if len(collection) > 10 {
			collection = collection[:10]
		}

		items := make([]bot.BotListItem, 0, len(collection))
		for _, a := range collection {
			title := a.NameCn
			if title == "" {
				title = a.Name
			}
			subtitle := ""
			if a.UserScore.Valid && a.UserScore.Int64 > 0 {
				subtitle = fmt.Sprintf("⭐ %d/10", a.UserScore.Int64)
			}

			items = append(items, bot.BotListItem{
				Title:    title,
				Subtitle: subtitle,
				Buttons: []bot.BotButton{
					{Label: "Detail", Data: fmt.Sprintf("detail:%d", a.BangumiID)},
				},
			})
		}

		return &bot.BotResponse{
			Text: fmt.Sprintf("📚 <b>%s</b> (%d)", strings.Title(statusFilter), len(collection)),
			List: items,
		}, nil
	}
}
```

- [ ] **Step 4: Implement /continue**

```go
// api/internal/bot/commands/continue.go
package commands

import (
	"context"
	"fmt"

	"github.com/milmil/api/internal/bot"
)

func ContinueHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		progress, err := svc.Queries.ListRecentProgress(ctx, 10)
		if err != nil {
			return &bot.BotResponse{Text: "Failed to load watch history."}, nil
		}

		if len(progress) == 0 {
			return &bot.BotResponse{Text: "No watch history yet."}, nil
		}

		items := make([]bot.BotListItem, 0, len(progress))
		for _, p := range progress {
			title := p.AnimeTitle
			if title == "" {
				title = p.AnimeTitleOriginal
			}

			// Progress percentage
			pct := 0.0
			if p.DurationSeconds > 0 {
				pct = float64(p.PositionSeconds) / float64(p.DurationSeconds) * 100
			}
			bar := progressBar(pct, 8)

			subtitle := fmt.Sprintf("EP%d %s %.0f%%", p.EpisodeNumber, bar, pct)
			if p.Completed {
				subtitle = fmt.Sprintf("EP%d ✅ Complete", p.EpisodeNumber)
			}

			items = append(items, bot.BotListItem{
				Title:    title,
				Subtitle: subtitle,
				ImageURL: p.CoverImage,
			})
		}

		return &bot.BotResponse{
			Text: "▶ <b>Continue Watching</b>",
			List: items,
		}, nil
	}
}
```

Note: The exact field names on `ListCollection`, `ListRecentProgress` result types depend on the sqlc-generated code. The implementer should read the actual store types and adapt. The key queries are `ListCollection` (filters by watch_status) and `ListRecentProgress` (returns recent watch progress with anime metadata).

- [ ] **Step 5: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./cmd/server`
Expected: May need to adapt field names to match sqlc-generated types.

- [ ] **Step 6: Commit**

```bash
git add api/internal/bot/commands/
git commit -m "feat(bot): add /downloads, /subscribe, /mylist, /continue handlers"
```

---

### Task 8: Telegram Adapter — Renderer

**Files:**
- Create: `api/internal/bot/telegram/renderer.go`

- [ ] **Step 1: Implement Telegram renderer**

```go
// api/internal/bot/telegram/renderer.go
package telegram

import (
	"fmt"
	"strings"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/milmil/api/internal/bot"
)

// RenderMessage converts a BotResponse into a Telegram message config.
// Returns either a MessageConfig or PhotoConfig.
func RenderMessage(chatID int64, resp *bot.BotResponse) tgbotapi.Chattable {
	text := buildText(resp)
	keyboard := buildKeyboard(resp)

	if resp.ImageURL != "" {
		photo := tgbotapi.NewPhoto(chatID, tgbotapi.FileURL(resp.ImageURL))
		photo.Caption = text
		photo.ParseMode = "HTML"
		if keyboard != nil {
			photo.ReplyMarkup = keyboard
		}
		return photo
	}

	msg := tgbotapi.NewMessage(chatID, text)
	msg.ParseMode = "HTML"
	msg.DisableWebPagePreview = true
	if keyboard != nil {
		msg.ReplyMarkup = keyboard
	}
	return msg
}

// RenderEditMessage converts a BotResponse for editing an existing message.
func RenderEditMessage(chatID int64, messageID int, resp *bot.BotResponse) tgbotapi.Chattable {
	text := buildText(resp)
	keyboard := buildKeyboard(resp)

	edit := tgbotapi.NewEditMessageText(chatID, messageID, text)
	edit.ParseMode = "HTML"
	edit.DisableWebPagePreview = true
	if keyboard != nil {
		markup := tgbotapi.InlineKeyboardMarkup{InlineKeyboard: keyboard.InlineKeyboard}
		edit.ReplyMarkup = &markup
	}
	return edit
}

func buildText(resp *bot.BotResponse) string {
	var sb strings.Builder
	sb.WriteString(resp.Text)

	// Fields
	if len(resp.Fields) > 0 {
		sb.WriteString("\n")
		for _, f := range resp.Fields {
			sb.WriteString(fmt.Sprintf("\n<b>%s:</b> %s", f.Label, f.Value))
		}
	}

	// List items
	if len(resp.List) > 0 {
		sb.WriteString("\n")
		for i, item := range resp.List {
			sb.WriteString(fmt.Sprintf("\n<b>%d.</b> %s", i+1, item.Title))
			if item.Subtitle != "" {
				sb.WriteString(fmt.Sprintf("\n    %s", item.Subtitle))
			}
		}
	}

	return sb.String()
}

func buildKeyboard(resp *bot.BotResponse) *tgbotapi.InlineKeyboardMarkup {
	var rows [][]tgbotapi.InlineKeyboardButton

	// Explicit button rows
	for _, row := range resp.Buttons {
		var tgRow []tgbotapi.InlineKeyboardButton
		for _, btn := range row {
			if btn.URL != "" {
				tgRow = append(tgRow, tgbotapi.NewInlineKeyboardButtonURL(btn.Label, btn.URL))
			} else if btn.Data != "" {
				tgRow = append(tgRow, tgbotapi.NewInlineKeyboardButtonData(btn.Label, btn.Data))
			}
		}
		if len(tgRow) > 0 {
			rows = append(rows, tgRow)
		}
	}

	// List item buttons (one row per item)
	for _, item := range resp.List {
		if len(item.Buttons) == 0 {
			continue
		}
		var tgRow []tgbotapi.InlineKeyboardButton
		for _, btn := range item.Buttons {
			if btn.URL != "" {
				tgRow = append(tgRow, tgbotapi.NewInlineKeyboardButtonURL(btn.Label, btn.URL))
			} else if btn.Data != "" {
				tgRow = append(tgRow, tgbotapi.NewInlineKeyboardButtonData(btn.Label, btn.Data))
			}
		}
		if len(tgRow) > 0 {
			rows = append(rows, tgRow)
		}
	}

	if len(rows) == 0 {
		return nil
	}

	markup := tgbotapi.NewInlineKeyboardMarkup(rows...)
	return &markup
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./cmd/server`

- [ ] **Step 3: Commit**

```bash
git add api/internal/bot/telegram/
git commit -m "feat(bot): add Telegram renderer"
```

---

### Task 9: Telegram Adapter — Transport (Polling + Webhook)

**Files:**
- Create: `api/internal/bot/telegram/adapter.go`

- [ ] **Step 1: Implement Telegram adapter with auto-switching**

```go
// api/internal/bot/telegram/adapter.go
package telegram

import (
	"context"
	"log/slog"
	"strings"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/milmil/api/internal/bot"
	"github.com/milmil/api/internal/notification"
)

// Adapter runs the Telegram bot with polling or webhook transport.
type Adapter struct {
	api    *tgbotapi.BotAPI
	router *bot.Router
	cfg    notification.TelegramBotConfig
	cancel context.CancelFunc
}

// New creates and starts the Telegram adapter.
func New(cfg notification.TelegramBotConfig, router *bot.Router) (*Adapter, error) {
	api, err := tgbotapi.NewBotAPI(cfg.BotToken)
	if err != nil {
		return nil, err
	}
	api.Debug = false

	a := &Adapter{
		api:    api,
		router: router,
		cfg:    cfg,
	}

	// Register commands menu
	commands := []tgbotapi.BotCommand{
		{Command: "start", Description: "Welcome & help"},
		{Command: "schedule", Description: "Weekly airing schedule"},
		{Command: "search", Description: "Search anime"},
		{Command: "detail", Description: "Anime details"},
		{Command: "downloads", Description: "Active downloads"},
		{Command: "subscribe", Description: "Auto-download subscription"},
		{Command: "status", Description: "System overview"},
		{Command: "mylist", Description: "Your collection"},
		{Command: "continue", Description: "Continue watching"},
	}
	cmdCfg := tgbotapi.NewSetMyCommands(commands...)
	if _, err := api.Request(cmdCfg); err != nil {
		slog.Warn("telegram: failed to set commands menu", "err", err)
	}

	slog.Info("telegram: bot started", "username", api.Self.UserName)
	return a, nil
}

// StartPolling starts long polling for updates.
func (a *Adapter) StartPolling(ctx context.Context) {
	ctx, cancel := context.WithCancel(ctx)
	a.cancel = cancel

	// Remove any existing webhook
	a.api.Request(tgbotapi.NewDeleteWebhook())

	u := tgbotapi.NewUpdate(0)
	u.Timeout = 30

	updates := a.api.GetUpdatesChan(u)

	slog.Info("telegram: polling started")

	for {
		select {
		case <-ctx.Done():
			a.api.StopReceivingUpdates()
			slog.Info("telegram: polling stopped")
			return
		case update := <-updates:
			go a.handleUpdate(ctx, update)
		}
	}
}

// HandleWebhookUpdate processes a single update from a webhook POST.
func (a *Adapter) HandleWebhookUpdate(update tgbotapi.Update) {
	go a.handleUpdate(context.Background(), update)
}

// Stop shuts down the adapter.
func (a *Adapter) Stop() {
	if a.cancel != nil {
		a.cancel()
	}
}

func (a *Adapter) handleUpdate(ctx context.Context, update tgbotapi.Update) {
	if update.CallbackQuery != nil {
		a.handleCallback(ctx, update.CallbackQuery)
		return
	}

	if update.Message == nil || !update.Message.IsCommand() {
		return
	}

	// Auth check
	if !a.isAllowed(update.Message.Chat.ID) {
		return
	}

	cmd := bot.CommandContext{
		Command:  update.Message.Command(),
		Args:     update.Message.CommandArguments(),
		ChatID:   update.Message.Chat.ID,
		Platform: "telegram",
	}

	resp, err := a.router.HandleCommand(ctx, cmd)
	if err != nil {
		slog.Error("telegram: command error", "cmd", cmd.Command, "err", err)
		resp = &bot.BotResponse{Text: "An error occurred."}
	}

	msg := RenderMessage(cmd.ChatID, resp)
	if _, err := a.api.Send(msg); err != nil {
		slog.Error("telegram: send failed", "err", err)
	}
}

func (a *Adapter) handleCallback(ctx context.Context, cq *tgbotapi.CallbackQuery) {
	if !a.isAllowed(cq.Message.Chat.ID) {
		return
	}

	// Acknowledge callback
	callback := tgbotapi.NewCallback(cq.ID, "")
	a.api.Request(callback)

	cb := bot.CallbackContext{
		Data:      cq.Data,
		ChatID:    cq.Message.Chat.ID,
		MessageID: cq.Message.MessageID,
		Platform:  "telegram",
	}

	resp, err := a.router.HandleCallback(ctx, cb)
	if err != nil {
		slog.Error("telegram: callback error", "data", cb.Data, "err", err)
		return
	}

	// Try to edit existing message; fall back to sending new message
	edit := RenderEditMessage(cb.ChatID, cb.MessageID, resp)
	if _, err := a.api.Send(edit); err != nil {
		// Edit may fail if message has photo — send new message instead
		msg := RenderMessage(cb.ChatID, resp)
		a.api.Send(msg)
	}
}

func (a *Adapter) isAllowed(chatID int64) bool {
	if len(a.cfg.AllowedChatIDs) == 0 {
		return true // no restriction
	}
	for _, id := range a.cfg.AllowedChatIDs {
		if id == chatID {
			return true
		}
	}
	return false
}

// ParseCommand extracts command name and args from a message text.
func ParseCommand(text string) (string, string) {
	text = strings.TrimSpace(text)
	if !strings.HasPrefix(text, "/") {
		return "", text
	}
	text = text[1:] // remove /
	// Remove @botname suffix
	if at := strings.Index(text, "@"); at > 0 {
		text = text[:at] + text[strings.Index(text[at:], " "):]
	}
	parts := strings.SplitN(text, " ", 2)
	cmd := strings.ToLower(parts[0])
	args := ""
	if len(parts) > 1 {
		args = strings.TrimSpace(parts[1])
	}
	return cmd, args
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./cmd/server`

- [ ] **Step 3: Commit**

```bash
git add api/internal/bot/telegram/
git commit -m "feat(bot): add Telegram adapter with polling and webhook support"
```

---

### Task 10: Discord Adapter

**Files:**
- Create: `api/internal/bot/discord/renderer.go`
- Create: `api/internal/bot/discord/adapter.go`

- [ ] **Step 1: Implement Discord renderer**

```go
// api/internal/bot/discord/renderer.go
package discord

import (
	"fmt"
	"strings"

	"github.com/bwmarrin/discordgo"
	"github.com/milmil/api/internal/bot"
)

// RenderInteractionResponse converts a BotResponse to a Discord interaction response.
func RenderInteractionResponse(resp *bot.BotResponse) *discordgo.InteractionResponse {
	embed := buildEmbed(resp)
	components := buildComponents(resp)

	data := &discordgo.InteractionResponseData{
		Embeds: []*discordgo.MessageEmbed{embed},
	}
	if len(components) > 0 {
		data.Components = components
	}

	return &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: data,
	}
}

// RenderMessage converts a BotResponse to a Discord message send.
func RenderMessage(resp *bot.BotResponse) *discordgo.MessageSend {
	embed := buildEmbed(resp)
	components := buildComponents(resp)

	msg := &discordgo.MessageSend{
		Embeds: []*discordgo.MessageEmbed{embed},
	}
	if len(components) > 0 {
		msg.Components = components
	}
	return msg
}

func buildEmbed(resp *bot.BotResponse) *discordgo.MessageEmbed {
	// Strip HTML tags for Discord (uses markdown)
	desc := stripHTML(resp.Text)

	embed := &discordgo.MessageEmbed{
		Description: desc,
		Color:       0x3b82f6, // blue
	}

	if resp.ImageURL != "" {
		embed.Thumbnail = &discordgo.MessageEmbedThumbnail{URL: resp.ImageURL}
	}

	// Fields
	for _, f := range resp.Fields {
		embed.Fields = append(embed.Fields, &discordgo.MessageEmbedField{
			Name:   f.Label,
			Value:  f.Value,
			Inline: f.Inline,
		})
	}

	// List items as fields
	if len(resp.List) > 0 {
		var sb strings.Builder
		for i, item := range resp.List {
			sb.WriteString(fmt.Sprintf("**%d.** %s", i+1, item.Title))
			if item.Subtitle != "" {
				sb.WriteString(fmt.Sprintf("\n%s", item.Subtitle))
			}
			sb.WriteString("\n")
		}
		embed.Fields = append(embed.Fields, &discordgo.MessageEmbedField{
			Name:  "Results",
			Value: sb.String(),
		})
	}

	return embed
}

func buildComponents(resp *bot.BotResponse) []discordgo.MessageComponent {
	var rows []discordgo.MessageComponent

	// Button rows
	for _, row := range resp.Buttons {
		var buttons []discordgo.MessageComponent
		for _, btn := range row {
			if btn.URL != "" {
				buttons = append(buttons, discordgo.Button{
					Label: btn.Label,
					Style: discordgo.LinkButton,
					URL:   btn.URL,
				})
			} else if btn.Data != "" {
				buttons = append(buttons, discordgo.Button{
					Label:    btn.Label,
					Style:    discordgo.PrimaryButton,
					CustomID: btn.Data,
				})
			}
		}
		if len(buttons) > 0 {
			rows = append(rows, discordgo.ActionsRow{Components: buttons})
		}
	}

	// List item buttons
	for _, item := range resp.List {
		if len(item.Buttons) == 0 {
			continue
		}
		var buttons []discordgo.MessageComponent
		for _, btn := range item.Buttons {
			if btn.URL != "" {
				buttons = append(buttons, discordgo.Button{
					Label: btn.Label,
					Style: discordgo.LinkButton,
					URL:   btn.URL,
				})
			} else if btn.Data != "" {
				buttons = append(buttons, discordgo.Button{
					Label:    btn.Label,
					Style:    discordgo.SecondaryButton,
					CustomID: btn.Data,
				})
			}
		}
		if len(buttons) > 0 {
			rows = append(rows, discordgo.ActionsRow{Components: buttons})
		}
	}

	return rows
}

func stripHTML(s string) string {
	// Simple HTML tag stripper — replace <b> with **, <i> with *, strip others
	s = strings.ReplaceAll(s, "<b>", "**")
	s = strings.ReplaceAll(s, "</b>", "**")
	s = strings.ReplaceAll(s, "<i>", "*")
	s = strings.ReplaceAll(s, "</i>", "*")
	s = strings.ReplaceAll(s, "<code>", "`")
	s = strings.ReplaceAll(s, "</code>", "`")
	// Strip remaining tags
	result := strings.Builder{}
	inTag := false
	for _, c := range s {
		if c == '<' {
			inTag = true
			continue
		}
		if c == '>' {
			inTag = false
			continue
		}
		if !inTag {
			result.WriteRune(c)
		}
	}
	return result.String()
}
```

- [ ] **Step 2: Implement Discord adapter**

```go
// api/internal/bot/discord/adapter.go
package discord

import (
	"context"
	"log/slog"
	"strings"

	"github.com/bwmarrin/discordgo"
	"github.com/milmil/api/internal/bot"
	"github.com/milmil/api/internal/notification"
)

// Adapter runs the Discord bot via gateway websocket.
type Adapter struct {
	session *discordgo.Session
	router  *bot.Router
	cfg     notification.DiscordBotConfig
	cancel  context.CancelFunc
}

// New creates and starts the Discord adapter.
func New(cfg notification.DiscordBotConfig, router *bot.Router) (*Adapter, error) {
	session, err := discordgo.New("Bot " + cfg.BotToken)
	if err != nil {
		return nil, err
	}

	a := &Adapter{
		session: session,
		router:  router,
		cfg:     cfg,
	}

	session.AddHandler(a.handleInteraction)

	session.Identify.Intents = discordgo.IntentsGuildMessages

	if err := session.Open(); err != nil {
		return nil, err
	}

	// Register slash commands
	commands := []*discordgo.ApplicationCommand{
		{Name: "start", Description: "Welcome & help"},
		{Name: "schedule", Description: "Weekly airing schedule"},
		{Name: "search", Description: "Search anime", Options: []*discordgo.ApplicationCommandOption{
			{Type: discordgo.ApplicationCommandOptionString, Name: "query", Description: "Anime name", Required: true},
		}},
		{Name: "detail", Description: "Anime details", Options: []*discordgo.ApplicationCommandOption{
			{Type: discordgo.ApplicationCommandOptionInteger, Name: "id", Description: "Bangumi ID", Required: true},
		}},
		{Name: "downloads", Description: "Active downloads"},
		{Name: "subscribe", Description: "Auto-download subscription", Options: []*discordgo.ApplicationCommandOption{
			{Type: discordgo.ApplicationCommandOptionString, Name: "anime", Description: "Anime name", Required: true},
		}},
		{Name: "status", Description: "System overview"},
		{Name: "mylist", Description: "Your collection", Options: []*discordgo.ApplicationCommandOption{
			{Type: discordgo.ApplicationCommandOptionString, Name: "status", Description: "Filter (watching/planning/completed)", Required: false},
		}},
		{Name: "continue", Description: "Continue watching"},
	}

	for _, cmd := range commands {
		if _, err := session.ApplicationCommandCreate(cfg.ApplicationID, "", cmd); err != nil {
			slog.Warn("discord: failed to register command", "cmd", cmd.Name, "err", err)
		}
	}

	slog.Info("discord: bot started", "app_id", cfg.ApplicationID)
	return a, nil
}

// Stop shuts down the Discord session.
func (a *Adapter) Stop() {
	if a.session != nil {
		a.session.Close()
	}
	if a.cancel != nil {
		a.cancel()
	}
}

func (a *Adapter) handleInteraction(s *discordgo.Session, i *discordgo.InteractionCreate) {
	switch i.Type {
	case discordgo.InteractionApplicationCommand:
		a.handleSlashCommand(s, i)
	case discordgo.InteractionMessageComponent:
		a.handleComponentInteraction(s, i)
	}
}

func (a *Adapter) handleSlashCommand(s *discordgo.Session, i *discordgo.InteractionCreate) {
	if !a.isAllowed(i.GuildID) {
		return
	}

	data := i.ApplicationCommandData()

	// Extract args from options
	args := ""
	for _, opt := range data.Options {
		switch opt.Type {
		case discordgo.ApplicationCommandOptionString:
			args = opt.StringValue()
		case discordgo.ApplicationCommandOptionInteger:
			args = strings.TrimSpace(args + " " + strings.Itoa(int(opt.IntValue())))
		}
	}

	cmd := bot.CommandContext{
		Command:  data.Name,
		Args:     strings.TrimSpace(args),
		ChatID:   0, // Discord uses channel IDs differently
		Platform: "discord",
	}

	resp, err := a.router.HandleCommand(context.Background(), cmd)
	if err != nil {
		slog.Error("discord: command error", "cmd", cmd.Command, "err", err)
		resp = &bot.BotResponse{Text: "An error occurred."}
	}

	interactionResp := RenderInteractionResponse(resp)
	if err := s.InteractionRespond(i.Interaction, interactionResp); err != nil {
		slog.Error("discord: respond failed", "err", err)
	}
}

func (a *Adapter) handleComponentInteraction(s *discordgo.Session, i *discordgo.InteractionCreate) {
	if !a.isAllowed(i.GuildID) {
		return
	}

	data := i.MessageComponentData()

	cb := bot.CallbackContext{
		Data:     data.CustomID,
		Platform: "discord",
	}

	resp, err := a.router.HandleCallback(context.Background(), cb)
	if err != nil {
		slog.Error("discord: callback error", "data", cb.Data, "err", err)
		return
	}

	// Update the original message
	embed := buildEmbed(resp)
	components := buildComponents(resp)
	editResp := &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseUpdateMessage,
		Data: &discordgo.InteractionResponseData{
			Embeds:     []*discordgo.MessageEmbed{embed},
			Components: components,
		},
	}
	if err := s.InteractionRespond(i.Interaction, editResp); err != nil {
		slog.Error("discord: update failed", "err", err)
	}
}

func (a *Adapter) isAllowed(guildID string) bool {
	if len(a.cfg.AllowedGuildIDs) == 0 {
		return true
	}
	for _, id := range a.cfg.AllowedGuildIDs {
		if id == guildID {
			return true
		}
	}
	return false
}
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./cmd/server`

- [ ] **Step 4: Commit**

```bash
git add api/internal/bot/discord/
git commit -m "feat(bot): add Discord adapter with slash commands and components"
```

---

### Task 11: Enriched Notifications

**Files:**
- Modify: `api/internal/notification/service.go`

Upgrade `dispatchExternal` to enrich download events with anime metadata before sending.

- [ ] **Step 1: Add metadata service to Service struct**

Update `Service` struct and `NewService` to accept an optional metadata service:

```go
type Service struct {
	queries  *store.Queries
	wsHub    *ws.Hub
	metadata MetadataLookup
}

// MetadataLookup is the subset of metadata.Service needed for enrichment.
type MetadataLookup interface {
	GetAnimeDetail(ctx context.Context, bangumiID int) (*metadata.AnimeDetail, error)
}

func NewService(queries *store.Queries, wsHub *ws.Hub, metadata ...MetadataLookup) *Service {
	s := &Service{queries: queries, wsHub: wsHub}
	if len(metadata) > 0 {
		s.metadata = metadata[0]
	}
	return s
}
```

- [ ] **Step 2: Enrich download events in dispatchExternal**

Add enrichment logic at the start of `dispatchExternal`, before building the `NotificationEvent`:

```go
// In dispatchExternal, after loading config and before building event:

// Enrich download events with anime metadata
if s.metadata != nil && metadata != nil {
	if bangumiIDStr, ok := metadata["bangumi_id"]; ok {
		// Try to parse bangumi_id from the download's metadata
	}
	// For download events, try to look up anime details from the download record
	if strings.HasPrefix(notifType, "download.") {
		if downloadID, ok := metadata["download_id"]; ok {
			// Fetch download to get bangumi_id
			dl, dlErr := s.queries.GetDownload(ctx, fmt.Sprintf("%v", downloadID))
			if dlErr == nil && dl.BangumiID.Valid {
				detail, detailErr := s.metadata.GetAnimeDetail(ctx, int(dl.BangumiID.Int64))
				if detailErr == nil {
					animeTitle := detail.Title
					if animeTitle == "" {
						animeTitle = detail.TitleOriginal
					}
					metadata["anime_name"] = animeTitle
					metadata["cover_image"] = detail.CoverImage
					// Parse episode from download name
					ep := parseEpisode(dl.Name)
					if ep != "" {
						metadata["episode"] = ep
					}
					// Parse subgroup
					sg := parseSubgroup(dl.Name)
					if sg != "" {
						metadata["subgroup"] = sg
					}
				}
			}
		}
	}
}
```

Note: Import `rss.ParseEpisode` and `rss.ParseSubgroup` or create local helpers. The implementer should read `api/internal/rss/parser.go` for the existing parsing functions and use them.

Update the `NotificationEvent` construction to use enriched metadata (convert `map[string]any` to `map[string]string` including new keys).

- [ ] **Step 3: Update main.go to pass metadata to NewService**

In `main.go`, change:
```go
notifier := notification.NewService(store.New(database), wsHub)
```
to:
```go
notifier := notification.NewService(store.New(database), wsHub, metadataSvc)
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./cmd/server`

- [ ] **Step 5: Commit**

```bash
git add api/internal/notification/service.go api/cmd/server/main.go
git commit -m "feat(notifications): enrich download events with anime metadata"
```

---

### Task 12: Wire Bot Engine in main.go

**Files:**
- Create: `api/internal/bot/engine.go`
- Modify: `api/cmd/server/main.go`
- Modify: `api/internal/api/router.go`

- [ ] **Step 1: Create bot engine that starts/stops adapters**

```go
// api/internal/bot/engine.go
package bot

import (
	"context"
	"log/slog"

	"github.com/milmil/api/internal/notification"
)

// TelegramStartFunc starts the Telegram adapter.
type TelegramStartFunc func(cfg notification.TelegramBotConfig, router *Router) (StoppableAdapter, error)

// DiscordStartFunc starts the Discord adapter.
type DiscordStartFunc func(cfg notification.DiscordBotConfig, router *Router) (StoppableAdapter, error)

// StoppableAdapter can be stopped.
type StoppableAdapter interface {
	Stop()
}

// Engine manages bot lifecycle.
type Engine struct {
	router    *Router
	telegram  StoppableAdapter
	discord   StoppableAdapter
	cancel    context.CancelFunc
}

// NewEngine creates the bot engine with a configured router.
func NewEngine(router *Router) *Engine {
	return &Engine{router: router}
}

// Start launches enabled bot adapters based on config.
func (e *Engine) Start(ctx context.Context, cfg notification.NotificationConfig, startTg TelegramStartFunc, startDiscord DiscordStartFunc) {
	ctx, cancel := context.WithCancel(ctx)
	e.cancel = cancel

	if cfg.Bot.Telegram.Enabled && cfg.Bot.Telegram.BotToken != "" {
		adapter, err := startTg(cfg.Bot.Telegram, e.router)
		if err != nil {
			slog.Error("bot: telegram start failed", "err", err)
		} else {
			e.telegram = adapter
			// Start polling in background if no webhook URL
			if cfg.Bot.Telegram.WebhookURL == "" {
				go func() {
					// Type assert to get StartPolling
					type poller interface {
						StartPolling(ctx context.Context)
					}
					if p, ok := adapter.(poller); ok {
						p.StartPolling(ctx)
					}
				}()
			}
		}
	}

	if cfg.Bot.Discord.Enabled && cfg.Bot.Discord.BotToken != "" {
		adapter, err := startDiscord(cfg.Bot.Discord, e.router)
		if err != nil {
			slog.Error("bot: discord start failed", "err", err)
		} else {
			e.discord = adapter
		}
	}
}

// Stop shuts down all adapters.
func (e *Engine) Stop() {
	if e.cancel != nil {
		e.cancel()
	}
	if e.telegram != nil {
		e.telegram.Stop()
	}
	if e.discord != nil {
		e.discord.Stop()
	}
}

// Router returns the command router (for webhook handler to access).
func (e *Engine) Router() *Router {
	return e.router
}
```

- [ ] **Step 2: Wire in main.go**

After the scheduler starts, add bot engine setup:

```go
// Bot engine
botRouter := bot.NewRouter()
botSvc := &commands.Services{
	Queries:    store.New(database),
	Metadata:   metadataSvc,
	Downloader: dlEngine,
}

// Register commands
botRouter.RegisterCommand("start", commands.StartHandler(botSvc))
botRouter.RegisterCommand("schedule", commands.ScheduleHandler(botSvc))
botRouter.RegisterCommand("search", commands.SearchHandler(botSvc))
botRouter.RegisterCommand("detail", commands.DetailHandler(botSvc))
botRouter.RegisterCommand("downloads", commands.DownloadsHandler(botSvc))
botRouter.RegisterCommand("subscribe", commands.SubscribeHandler(botSvc))
botRouter.RegisterCommand("status", commands.StatusHandler(botSvc))
botRouter.RegisterCommand("mylist", commands.MyListHandler(botSvc))
botRouter.RegisterCommand("continue", commands.ContinueHandler(botSvc))

// Register callbacks
botRouter.RegisterCallback("detail", commands.DetailCallback(botSvc))
botRouter.RegisterCallback("sub_pick", commands.SubscribePickCallback(botSvc))
botRouter.RegisterCallback("sub_do", commands.SubscribeDoCallback(botSvc))
botRouter.RegisterCallback("dl_pause", commands.DownloadControlCallback(botSvc))
botRouter.RegisterCallback("dl_resume", commands.DownloadControlCallback(botSvc))
botRouter.RegisterCallback("dl_cancel", commands.DownloadControlCallback(botSvc))

botEngine := bot.NewEngine(botRouter)
notifCfg, _ := notification.LoadNotificationConfig(context.Background(), store.New(database))
botEngine.Start(context.Background(), notifCfg, 
	func(cfg notification.TelegramBotConfig, r *bot.Router) (bot.StoppableAdapter, error) {
		return tgadapter.New(cfg, r)
	},
	func(cfg notification.DiscordBotConfig, r *bot.Router) (bot.StoppableAdapter, error) {
		return dcadapter.New(cfg, r)
	},
)
```

Add imports:
```go
"github.com/milmil/api/internal/bot"
"github.com/milmil/api/internal/bot/commands"
tgadapter "github.com/milmil/api/internal/bot/telegram"
dcadapter "github.com/milmil/api/internal/bot/discord"
```

Add `botEngine.Stop()` to the shutdown sequence alongside `sched.Stop()`.

- [ ] **Step 3: Add Telegram webhook route**

In `api/internal/api/router.go`, add a webhook endpoint. The handler needs access to the Telegram adapter to forward updates. Pass the bot engine to `NewRouter` or add a separate registration:

```go
// After other routes, add:
e.POST("/api/v1/bot/telegram/webhook", handleTelegramWebhook(botEngine))
```

The webhook handler parses the Telegram update from the request body and calls `adapter.HandleWebhookUpdate()`.

- [ ] **Step 4: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./cmd/server`

- [ ] **Step 5: Commit**

```bash
git add api/internal/bot/ api/cmd/server/main.go api/internal/api/router.go
git commit -m "feat(bot): wire bot engine with Telegram and Discord adapters"
```

---

### Task 13: Frontend — Bot Settings UI

**Files:**
- Modify: `web/src/pages/settings/NotificationSettingsPanel.tsx`
- Modify: `web/src/lib/api/notification-settings.ts`

- [ ] **Step 1: Extend NotificationSettings type**

Add to `notification-settings.ts`:

```typescript
export interface TelegramBotConfig {
  enabled: boolean;
  bot_token: string;
  webhook_url: string;
  allowed_chat_ids: number[];
}

export interface DiscordBotConfig {
  enabled: boolean;
  bot_token: string;
  application_id: string;
  allowed_guild_ids: string[];
}

export interface BotConfig {
  telegram: TelegramBotConfig;
  discord: DiscordBotConfig;
}
```

Add `bot: BotConfig` to `NotificationSettings` interface.

- [ ] **Step 2: Add Bot Commands section to NotificationSettingsPanel**

Add a new section below the existing provider cards and event routing matrix. Use the same patterns (SettingsCard, Switch, PasswordInput, Input). Two cards:

**Telegram Bot card:**
- Switch to enable
- Bot Token (PasswordInput — can share with notification provider)
- Webhook URL (Input — optional, blank = polling)
- Allowed Chat IDs (Input — comma-separated numbers)

**Discord Bot card:**
- Switch to enable
- Bot Token (PasswordInput)
- Application ID (Input)
- Allowed Guild IDs (Input — comma-separated)

Follow the exact same patterns from the existing provider cards in the panel.

- [ ] **Step 3: Add i18n keys**

Run `bun run i18n:extract`, add translations for:
- `notifications.botCommands` → "Bot Commands"
- `notifications.botCommands.desc` → "Enable interactive bot commands in Telegram or Discord"
- `notifications.bot.webhookUrl` → "Webhook URL (optional, blank = polling)"
- `notifications.bot.applicationId` → "Application ID"
- `notifications.bot.allowedChatIds` → "Allowed Chat IDs"
- `notifications.bot.allowedGuildIds` → "Allowed Guild IDs"

Add translations for all locales, then `bun run i18n:compile`.

- [ ] **Step 4: Verify typecheck**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`

- [ ] **Step 5: Commit**

```bash
git add web/src/
git commit -m "feat(bot): add bot commands settings UI"
```

---

### Task 14: E2E Verification

- [ ] **Step 1: Build backend**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./cmd/server`

- [ ] **Step 2: Run all Go tests**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/bot/... ./internal/notification/...`

- [ ] **Step 3: Build frontend**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run build`

- [ ] **Step 4: Manual E2E test**

Ask user to:
1. Configure Telegram bot token in Settings → Notifications → Bot Commands
2. Send `/start` to the bot
3. Send `/schedule` — verify weekly schedule
4. Send `/search frieren` — verify results with buttons
5. Tap [Detail] button — verify anime card
6. Tap [Subscribe] button — verify source picker
7. Send `/downloads` — verify active downloads
8. Send `/status` — verify system overview
9. Trigger a download and verify enriched notification with cover + buttons
