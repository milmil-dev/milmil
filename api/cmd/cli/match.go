package main

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"time"

	"github.com/milmil/api/cmd/cli/internal/confirm"
	"github.com/milmil/api/cmd/cli/internal/output"
	"github.com/spf13/cobra"
)

// matchSummary mirrors the server's matcher.MatchSummary returned by
// POST /libraries/:id/match.
type matchSummary struct {
	Matched      int `json:"matched"`
	Unmatched    int `json:"unmatched"`
	Errors       int `json:"errors"`
	ByDandanplay int `json:"by_dandanplay"`
	ByBangumi    int `json:"by_bangumi"`
	ByTMDB       int `json:"by_tmdb"`
}

// mediaFileItem is a minimal subset of the server's media-file list item.
type mediaFileItem struct {
	ID          string `json:"id"`
	Filename    string `json:"filename"`
	Path        string `json:"path"`
	MatchStatus string `json:"match_status"`
	SizeBytes   int64  `json:"size_bytes"`
}

var matchCmd = &cobra.Command{
	Use:   "match",
	Short: "Auto-match files, list unmatched, apply manual matches, undo",
}

var matchAutoCmd = &cobra.Command{
	Use:   "auto",
	Short: "Run the multi-pass matcher across a library",
	Long: `Triggers POST /api/v1/libraries/:id/match — the server's existing
multi-pass matcher (DandanPlay → Bangumi → TMDB → AniDB title fallback).

NOTE: The plan's POST /api/v1/match/auto with --confidence-floor support
is deferred to v0.2. This command wraps the existing endpoint, which has
its own internal accept thresholds. --confidence-floor is therefore not
yet wired and will warn if passed.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		libraryID, _ := cmd.Flags().GetString("library")
		if libraryID == "" {
			return fmt.Errorf("--library <id> is required")
		}
		if floor, _ := cmd.Flags().GetFloat64("confidence-floor"); floor > 0 {
			fmt.Fprintln(os.Stderr,
				"warning: --confidence-floor is not yet honoured; the server's existing matcher uses internal thresholds. Coming in v0.2.")
		}
		yes, _ := cmd.Flags().GetBool("yes")

		c, err := newClient()
		if err != nil {
			return err
		}

		if !yes && !flagDryRun {
			if !confirm.AskYN(fmt.Sprintf("Run auto-match across library %s?", libraryID)) {
				output.Printf("Cancelled.")
				return nil
			}
		}

		var summary matchSummary
		path := fmt.Sprintf("/api/v1/libraries/%s/match", libraryID)
		if err := c.DoJSON("POST", path, nil, nil, &summary); err != nil {
			return err
		}
		if flagJSON {
			return output.PrintJSON(summary)
		}
		output.Printf("Matched:    %d", summary.Matched)
		output.Printf("Unmatched:  %d", summary.Unmatched)
		output.Printf("Errors:     %d", summary.Errors)
		output.Printf("  via DandanPlay: %d", summary.ByDandanplay)
		output.Printf("  via Bangumi:    %d", summary.ByBangumi)
		output.Printf("  via TMDB:       %d", summary.ByTMDB)
		return nil
	},
}

var matchListCmd = &cobra.Command{
	Use:   "list",
	Short: "List media files in a library, optionally filtered by status",
	RunE: func(cmd *cobra.Command, args []string) error {
		libraryID, _ := cmd.Flags().GetString("library")
		if libraryID == "" {
			return fmt.Errorf("--library <id> is required")
		}
		status, _ := cmd.Flags().GetString("status")
		query, _ := cmd.Flags().GetString("query")
		perPage, _ := cmd.Flags().GetInt("limit")

		c, err := newClient()
		if err != nil {
			return err
		}
		q := url.Values{}
		if status != "" {
			q.Set("status", status)
		}
		if query != "" {
			q.Set("q", query)
		}
		if perPage > 0 {
			q.Set("per_page", strconv.Itoa(perPage))
		}

		var resp struct {
			Items []mediaFileItem `json:"items"`
			Total int             `json:"total"`
		}
		path := fmt.Sprintf("/api/v1/libraries/%s/media-files", libraryID)
		if err := c.DoJSON("GET", path, nil, q, &resp); err != nil {
			return err
		}
		if flagJSON {
			return output.PrintJSON(resp.Items)
		}
		if len(resp.Items) == 0 {
			output.Printf("No files match.")
			return nil
		}
		rows := make([][]string, 0, len(resp.Items))
		for _, f := range resp.Items {
			rows = append(rows, []string{f.ID, f.MatchStatus, f.Filename})
		}
		output.PrintTable(os.Stdout, []string{"ID", "Status", "Filename"}, rows)
		output.Printf("(showing %d of %d)", len(resp.Items), resp.Total)
		return nil
	},
}

var matchApplyCmd = &cobra.Command{
	Use:   "apply",
	Short: "Manually match a file to a (Bangumi anime, Bangumi episode)",
	RunE: func(cmd *cobra.Command, args []string) error {
		fileID, _ := cmd.Flags().GetString("file")
		bangumiID, _ := cmd.Flags().GetInt64("bangumi")
		episodeID, _ := cmd.Flags().GetInt64("episode")
		if fileID == "" || bangumiID == 0 || episodeID == 0 {
			return fmt.Errorf("--file, --bangumi, and --episode are all required")
		}

		c, err := newClient()
		if err != nil {
			return err
		}
		body := map[string]any{
			"bangumi_id": bangumiID,
			"episode_id": episodeID,
		}
		path := fmt.Sprintf("/api/v1/media-files/%s/match", fileID)
		if err := c.DoJSON("PUT", path, body, nil, nil); err != nil {
			return err
		}
		output.Printf("Match applied to %s.", fileID)
		return nil
	},
}

var matchUndoCmd = &cobra.Command{
	Use:   "undo",
	Short: "Reverse one audit entry (--id) or every entry within a window (--since)",
	Long: `Two ways to undo:
  --id <audit_id>           reverse one entry and its macro children
  --since <duration|RFC3339> reverse every entry created inside the window
                            ('1h', '15m', '2026-04-27T10:00:00Z')

Without --yes, you'll be asked to confirm before the request is sent. Add
--dry-run to preview which entries would be reversed without applying.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		id, _ := cmd.Flags().GetString("id")
		since, _ := cmd.Flags().GetString("since")
		yes, _ := cmd.Flags().GetBool("yes")
		if id == "" && since == "" {
			return fmt.Errorf("provide --id <audit_id> or --since <duration|RFC3339>")
		}
		if id != "" && since != "" {
			return fmt.Errorf("--id and --since are mutually exclusive")
		}

		body := map[string]any{"dry_run": flagDryRun}
		if id != "" {
			body["id"] = id
		}
		if since != "" {
			ts, err := parseSinceFlag(since)
			if err != nil {
				return err
			}
			body["since"] = ts
		}

		if !yes && !flagDryRun {
			label := id
			if label == "" {
				label = "since=" + since
			}
			if !confirm.AskYN(fmt.Sprintf("Undo audit entry/window %q?", label)) {
				output.Printf("Cancelled.")
				return nil
			}
		}

		c, err := newClient()
		if err != nil {
			return err
		}
		var resp struct {
			Items []struct {
				AuditID string `json:"audit_id"`
				Status  string `json:"status"`
				Reason  string `json:"reason,omitempty"`
			} `json:"items"`
		}
		if err := c.DoJSON("POST", "/api/v1/audit/undo", body, nil, &resp); err != nil {
			return err
		}
		if flagJSON {
			return output.PrintJSON(resp)
		}
		rows := make([][]string, 0, len(resp.Items))
		for _, it := range resp.Items {
			rows = append(rows, []string{it.AuditID, it.Status, it.Reason})
		}
		output.PrintTable(os.Stdout, []string{"Audit ID", "Status", "Reason"}, rows)
		return nil
	},
}

// parseSinceFlag accepts either a Go duration ("1h", "15m") relative to now,
// or an RFC3339 timestamp. Returns the resolved timestamp as RFC3339 in UTC.
func parseSinceFlag(s string) (string, error) {
	if d, err := time.ParseDuration(s); err == nil {
		return time.Now().UTC().Add(-d).Format(time.RFC3339), nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.UTC().Format(time.RFC3339), nil
	}
	return "", fmt.Errorf("--since: %q is neither a Go duration (e.g. 1h) nor an RFC3339 timestamp", s)
}

func init() {
	matchAutoCmd.Flags().String("library", "", "library ID to match (required)")
	matchAutoCmd.Flags().Float64("confidence-floor", 0, "v0.2 macro flag — currently no-op (warns)")
	matchAutoCmd.Flags().Bool("yes", false, "skip confirmation prompt")

	matchListCmd.Flags().String("library", "", "library ID to list (required)")
	matchListCmd.Flags().String("status", "", "filter by match_status: unmatched, matched, all")
	matchListCmd.Flags().String("query", "", "filename substring filter")
	matchListCmd.Flags().Int("limit", 0, "max results per page (server default 50, max 100)")

	matchApplyCmd.Flags().String("file", "", "media-file ID (required)")
	matchApplyCmd.Flags().Int64("bangumi", 0, "Bangumi anime ID (required)")
	matchApplyCmd.Flags().Int64("episode", 0, "Bangumi/DandanPlay episode ID (required)")

	matchUndoCmd.Flags().String("id", "", "audit entry ID to reverse")
	matchUndoCmd.Flags().String("since", "", "duration ('1h') or RFC3339 timestamp")
	matchUndoCmd.Flags().Bool("yes", false, "skip confirmation prompt")

	matchCmd.AddCommand(matchAutoCmd, matchListCmd, matchApplyCmd, matchUndoCmd)
	rootCmd.AddCommand(matchCmd)
}
