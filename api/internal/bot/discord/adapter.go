package discord

import (
	"context"
	"log/slog"
	"strconv"
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

	commands := []*discordgo.ApplicationCommand{
		{Name: "start", Description: "Welcome & help"},
		{Name: "schedule", Description: "Weekly airing schedule"},
		{
			Name:        "search",
			Description: "Search anime",
			Options: []*discordgo.ApplicationCommandOption{
				{Type: discordgo.ApplicationCommandOptionString, Name: "query", Description: "Anime name", Required: true},
			},
		},
		{
			Name:        "detail",
			Description: "Anime details",
			Options: []*discordgo.ApplicationCommandOption{
				{Type: discordgo.ApplicationCommandOptionInteger, Name: "id", Description: "Bangumi ID", Required: true},
			},
		},
		{Name: "downloads", Description: "Active downloads"},
		{
			Name:        "subscribe",
			Description: "追番 — 自動下載新集數",
			Options: []*discordgo.ApplicationCommandOption{
				{Type: discordgo.ApplicationCommandOptionString, Name: "anime", Description: "Anime name", Required: true},
			},
		},
		{Name: "status", Description: "System overview"},
		{
			Name:        "mylist",
			Description: "Your collection",
			Options: []*discordgo.ApplicationCommandOption{
				{Type: discordgo.ApplicationCommandOptionString, Name: "status", Description: "Filter (watching/planning/completed)", Required: false},
			},
		},
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
		_ = a.session.Close()
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

	// Extract args from options by concatenating string/integer values.
	var parts []string
	for _, opt := range data.Options {
		switch opt.Type {
		case discordgo.ApplicationCommandOptionString:
			if v := opt.StringValue(); v != "" {
				parts = append(parts, v)
			}
		case discordgo.ApplicationCommandOptionInteger:
			parts = append(parts, strconv.FormatInt(opt.IntValue(), 10))
		}
	}
	args := strings.TrimSpace(strings.Join(parts, " "))

	cmd := bot.CommandContext{
		Command:  data.Name,
		Args:     args,
		ChatID:   0, // Discord uses channel IDs differently.
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

	// Edit the original message in place.
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
