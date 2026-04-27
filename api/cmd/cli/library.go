package main

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/milmil/api/cmd/cli/internal/output"
	"github.com/spf13/cobra"
)

// libraryListItem mirrors the server's libraryListItem DTO. Keep field
// names aligned with the server response shape so we can decode directly
// without intermediate normalization.
type libraryListItem struct {
	ID                  string  `json:"id"`
	Name                string  `json:"name"`
	Path                string  `json:"path"`
	Enabled             int64   `json:"enabled"`
	ScanIntervalMinutes int64   `json:"scan_interval_minutes"`
	LastScannedAt       *string `json:"last_scanned_at"`
	SourceType          string  `json:"source_type"`
	FileCount           int64   `json:"file_count"`
	MatchedCount        int64   `json:"matched_count"`
	UnmatchedCount      int64   `json:"unmatched_count"`
	TotalSizeBytes      int64   `json:"total_size_bytes"`
}

var libraryCmd = &cobra.Command{
	Use:   "library",
	Short: "Manage libraries (list, add, scan, stats)",
}

var libraryListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all libraries",
	RunE: func(cmd *cobra.Command, args []string) error {
		c, err := newClient()
		if err != nil {
			return err
		}
		var items []libraryListItem
		if err := c.DoJSON("GET", "/api/v1/libraries", nil, nil, &items); err != nil {
			return err
		}
		if flagJSON {
			return output.PrintJSON(items)
		}
		rows := make([][]string, 0, len(items))
		for _, l := range items {
			rows = append(rows, []string{
				l.ID,
				l.Name,
				l.Path,
				strconv.FormatInt(l.FileCount, 10),
				strconv.FormatInt(l.MatchedCount, 10),
				strconv.FormatInt(l.UnmatchedCount, 10),
			})
		}
		output.PrintTable(os.Stdout, []string{"ID", "Name", "Path", "Files", "Matched", "Unmatched"}, rows)
		return nil
	},
}

var libraryAddCmd = &cobra.Command{
	Use:   "add",
	Short: "Register a new local library",
	Long: `Register a new library backed by a directory on the milmil host.

For network-backed sources (rclone, SMB, NFS) use the web UI; the CLI
add command currently supports local paths only.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		path, _ := cmd.Flags().GetString("path")
		name, _ := cmd.Flags().GetString("name")
		if path == "" {
			return fmt.Errorf("--path is required")
		}
		if name == "" {
			name = filepath.Base(path)
		}

		c, err := newClient()
		if err != nil {
			return err
		}
		var resp struct {
			ID   string `json:"id"`
			Name string `json:"name"`
			Path string `json:"path"`
		}
		body := map[string]any{
			"name":        name,
			"path":        path,
			"source_type": "local",
		}
		if err := c.DoJSON("POST", "/api/v1/libraries", body, nil, &resp); err != nil {
			return err
		}
		if flagJSON {
			return output.PrintJSON(resp)
		}
		output.Printf("Library created: %s (%s) at %s", resp.Name, resp.ID, resp.Path)
		return nil
	},
}

var libraryScanCmd = &cobra.Command{
	Use:   "scan <library_id>",
	Short: "Trigger a scan; --wait blocks until done",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		wait, _ := cmd.Flags().GetBool("wait")
		c, err := newClient()
		if err != nil {
			return err
		}
		if err := c.DoJSON("POST", fmt.Sprintf("/api/v1/libraries/%s/scan", args[0]), nil, nil, nil); err != nil {
			return err
		}
		output.Printf("Scan triggered for %s.", args[0])
		if !wait {
			return nil
		}

		output.Printf("Waiting for scan to complete...")
		t0 := time.Now()
		var state struct {
			Status      string `json:"status"`
			CompletedAt string `json:"completed_at,omitempty"`
		}
		q := url.Values{"timeout": []string{"600"}}
		if err := c.DoJSON("GET", fmt.Sprintf("/api/v1/library/%s/scan/wait", args[0]), nil, q, &state); err != nil {
			return err
		}
		output.Printf("Scan %s in %s.", state.Status, time.Since(t0).Round(time.Second))
		return nil
	},
}

var libraryStatsCmd = &cobra.Command{
	Use:   "stats <library_id>",
	Short: "Show library counts + last-scan time",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		c, err := newClient()
		if err != nil {
			return err
		}
		var lib libraryListItem
		if err := c.DoJSON("GET", "/api/v1/libraries/"+args[0], nil, nil, &lib); err != nil {
			return err
		}
		if flagJSON {
			return output.PrintJSON(lib)
		}
		output.Printf("Library:    %s (%s)", lib.Name, lib.ID)
		output.Printf("Path:       %s", lib.Path)
		output.Printf("Source:     %s", lib.SourceType)
		output.Printf("Files:      %d (matched %d, unmatched %d)", lib.FileCount, lib.MatchedCount, lib.UnmatchedCount)
		output.Printf("Total size: %d bytes", lib.TotalSizeBytes)
		if lib.LastScannedAt != nil {
			output.Printf("Last scan:  %s", *lib.LastScannedAt)
		} else {
			output.Printf("Last scan:  never")
		}
		return nil
	},
}

func init() {
	libraryAddCmd.Flags().String("path", "", "host filesystem path to the library root (required)")
	libraryAddCmd.Flags().String("name", "", "human-readable name (defaults to basename of --path)")
	libraryScanCmd.Flags().Bool("wait", false, "block until scan finishes")
	libraryCmd.AddCommand(libraryListCmd, libraryAddCmd, libraryScanCmd, libraryStatsCmd)
	rootCmd.AddCommand(libraryCmd)
}
