package main

import (
	"fmt"
	"net/url"
	"os"
	"strconv"

	"github.com/milmil/api/cmd/cli/internal/output"
	"github.com/spf13/cobra"
)

type searchAnimeItem struct {
	ID        string   `json:"id"`
	BangumiID *int64   `json:"bangumi_id,omitempty"`
	AnilistID *int64   `json:"anilist_id,omitempty"`
	Title     string   `json:"title"`
	AltTitles []string `json:"alt_titles"`
	Score     float64  `json:"score"`
	Source    string   `json:"source"`
}

var searchCmd = &cobra.Command{
	Use:   "search",
	Short: "Search for anime, episodes, or files",
}

var searchAnimeCmd = &cobra.Command{
	Use:   "anime <query>",
	Short: "Fuzzy-search the local anime library",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		limit, _ := cmd.Flags().GetInt("limit")
		c, err := newClient()
		if err != nil {
			return err
		}
		q := url.Values{"q": []string{args[0]}}
		if limit > 0 {
			q.Set("limit", strconv.Itoa(limit))
		}
		var resp struct {
			Items []searchAnimeItem `json:"items"`
		}
		if err := c.DoJSON("GET", "/api/v1/search/anime", nil, q, &resp); err != nil {
			return err
		}
		if flagJSON {
			return output.PrintJSON(resp.Items)
		}
		if len(resp.Items) == 0 {
			output.Printf("No matches for %q.", args[0])
			return nil
		}
		rows := make([][]string, 0, len(resp.Items))
		for _, item := range resp.Items {
			bangumi := "-"
			if item.BangumiID != nil {
				bangumi = strconv.FormatInt(*item.BangumiID, 10)
			}
			rows = append(rows, []string{
				item.ID,
				item.Title,
				bangumi,
				fmt.Sprintf("%.2f", item.Score),
				item.Source,
			})
		}
		output.PrintTable(os.Stdout, []string{"ID", "Title", "Bangumi", "Score", "Source"}, rows)
		return nil
	},
}

func init() {
	searchAnimeCmd.Flags().Int("limit", 0, "max results (server default 20, max 100)")
	searchCmd.AddCommand(searchAnimeCmd)
	rootCmd.AddCommand(searchCmd)
}
