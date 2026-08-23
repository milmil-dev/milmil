package commands

import (
	"context"
	"fmt"
	"strings"

	"github.com/milmil/api/internal/bot"
)

// LibraryHandler lists all libraries with stats.
func LibraryHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		libraries, err := svc.Queries.ListLibraries(ctx)
		if err != nil {
			return &bot.BotResponse{Text: "Failed to load libraries."}, nil
		}

		if len(libraries) == 0 {
			return &bot.BotResponse{Text: "No libraries configured."}, nil
		}

		items := make([]bot.BotListItem, 0, len(libraries))
		for _, lib := range libraries {
			subtitle := lib.Path

			items = append(items, bot.BotListItem{
				Title:    lib.Name,
				Subtitle: subtitle,
				Buttons: []bot.BotButton{
					{Label: "Scan", Data: fmt.Sprintf("scan:%s", lib.ID)},
				},
			})
		}

		return &bot.BotResponse{
			Text: fmt.Sprintf("<b>Libraries</b> (%d)", len(libraries)),
			List: items,
		}, nil
	}
}

// ScanHandler triggers a library scan.
func ScanHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		args := strings.TrimSpace(cmd.Args)

		libraries, err := svc.Queries.ListLibraries(ctx)
		if err != nil || len(libraries) == 0 {
			return &bot.BotResponse{Text: "No libraries found."}, nil
		}

		// If no args, show picker buttons
		if args == "" {
			buttons := make([]bot.BotButton, 0, len(libraries))
			for _, lib := range libraries {
				buttons = append(buttons, bot.BotButton{
					Label: lib.Name,
					Data:  fmt.Sprintf("scan:%s", lib.ID),
				})
			}
			return &bot.BotResponse{
				Text:    "Select a library to scan:",
				Buttons: [][]bot.BotButton{buttons},
			}, nil
		}

		// Find library by name or ID
		var targetID, targetName string
		for _, lib := range libraries {
			if lib.ID == args || strings.EqualFold(lib.Name, args) {
				targetID = lib.ID
				targetName = lib.Name
				break
			}
		}
		if targetID == "" {
			return &bot.BotResponse{Text: fmt.Sprintf("Library \"%s\" not found.", args)}, nil
		}

		return triggerScan(ctx, svc, targetID, targetName)
	}
}

// ScanCallback handles "scan:<library_id>" callbacks.
func ScanCallback(svc *Services) bot.CallbackHandler {
	return func(ctx context.Context, cb bot.CallbackContext) (*bot.BotResponse, error) {
		parts := strings.SplitN(cb.Data, ":", 2)
		if len(parts) < 2 {
			return &bot.BotResponse{Text: "Invalid scan callback."}, nil
		}
		libID := parts[1]

		lib, err := svc.Queries.GetLibrary(ctx, libID)
		if err != nil {
			return &bot.BotResponse{Text: "Library not found."}, nil
		}

		return triggerScan(ctx, svc, lib.ID, lib.Name)
	}
}

func triggerScan(ctx context.Context, svc *Services, libID, libName string) (*bot.BotResponse, error) {
	// The actual scan is async — we just notify that it was triggered
	// The scan pipeline will run via the existing worker system
	lib, err := svc.Queries.GetLibrary(ctx, libID)
	if err != nil {
		return &bot.BotResponse{Text: "Library not found."}, nil
	}

	if svc.Scanner != nil {
		go func() {
			// The scanner logs its own failures.
			_ = svc.Scanner.ScanLibrary(context.Background(), lib, "{}")
		}()
	}

	return &bot.BotResponse{
		Text: fmt.Sprintf("Scanning <b>%s</b>...\nYou'll receive a notification when done.", libName),
	}, nil
}
