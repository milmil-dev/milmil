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

type BotField struct {
	Label  string `json:"label"`
	Value  string `json:"value"`
	Inline bool   `json:"inline"`
}

type BotButton struct {
	Label string `json:"label"`
	Data  string `json:"data,omitempty"`
	URL   string `json:"url,omitempty"`
}

type BotListItem struct {
	Title    string      `json:"title"`
	Subtitle string      `json:"subtitle,omitempty"`
	ImageURL string      `json:"image_url,omitempty"`
	Buttons  []BotButton `json:"buttons,omitempty"`
}

// CommandContext holds the parsed command invocation.
type CommandContext struct {
	Command  string
	Args     string
	ChatID   int64
	Platform string
}

// CallbackContext holds a button callback invocation.
type CallbackContext struct {
	Data      string
	ChatID    int64
	MessageID int
	Platform  string
}

type CommandHandler func(ctx context.Context, cmd CommandContext) (*BotResponse, error)
type CallbackHandler func(ctx context.Context, cb CallbackContext) (*BotResponse, error)

// Router dispatches commands and callbacks to handlers.
type Router struct {
	commands  map[string]CommandHandler
	callbacks map[string]CallbackHandler
}

func NewRouter() *Router {
	return &Router{
		commands:  make(map[string]CommandHandler),
		callbacks: make(map[string]CallbackHandler),
	}
}

func (r *Router) RegisterCommand(name string, handler CommandHandler) {
	r.commands[name] = handler
}

func (r *Router) RegisterCallback(prefix string, handler CallbackHandler) {
	r.callbacks[prefix] = handler
}

func (r *Router) HandleCommand(ctx context.Context, cmd CommandContext) (*BotResponse, error) {
	handler, ok := r.commands[cmd.Command]
	if !ok {
		return &BotResponse{Text: "Unknown command. Send /start for help."}, nil
	}
	return handler(ctx, cmd)
}

func (r *Router) HandleCallback(ctx context.Context, cb CallbackContext) (*BotResponse, error) {
	prefix := cb.Data
	for i := 0; i < len(cb.Data); i++ {
		if cb.Data[i] == ':' {
			prefix = cb.Data[:i]
			break
		}
	}
	handler, ok := r.callbacks[prefix]
	if !ok {
		return &BotResponse{Text: "Unknown action."}, nil
	}
	return handler(ctx, cb)
}
