package main

import (
	"fmt"
	"math"
	"net/url"

	"github.com/milmil/api/cmd/cli/internal/output"
	"github.com/spf13/cobra"
)

var watchCmd = &cobra.Command{
	Use:   "watch",
	Short: "Resolve titles + episodes to a watch URL",
}

var watchResolveCmd = &cobra.Command{
	Use:   "resolve <title>",
	Short: "Resolve a fuzzy title + episode number to a watch URL",
	Long: `Composes three server calls:
  1. GET /search/anime?q=<title>            — picks the highest-scored hit
  2. GET /anime/:bangumiId/playable-episodes — needs the hit's Bangumi ID
  3. GET /episodes/:id/watch-url            — final URL

Fails if the top match has no Bangumi ID (the local-only path needs the
v0.2 macro endpoint to round-trip without remote IDs).`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		epNum, _ := cmd.Flags().GetFloat64("episode")
		if epNum <= 0 {
			return fmt.Errorf("--episode (1-based) is required")
		}

		c, err := newClient()
		if err != nil {
			return err
		}

		var search struct {
			Items []searchAnimeItem `json:"items"`
		}
		if err := c.DoJSON("GET", "/api/v1/search/anime", nil, url.Values{"q": []string{args[0]}}, &search); err != nil {
			return fmt.Errorf("search: %w", err)
		}
		if len(search.Items) == 0 {
			return fmt.Errorf("no anime matches %q", args[0])
		}
		anime := search.Items[0]
		if anime.BangumiID == nil {
			return fmt.Errorf("top match %q has no Bangumi ID — playable-episodes lookup not available; pick by ID with 'episode list --anime-id' once the local path is supported", anime.Title)
		}

		var env playableEpisodesEnvelope
		path := fmt.Sprintf("/api/v1/anime/%d/playable-episodes", *anime.BangumiID)
		if err := c.DoJSON("GET", path, nil, nil, &env); err != nil {
			return fmt.Errorf("list episodes: %w", err)
		}
		var pickEpisodeID string
		for _, e := range env.Episodes {
			if math.Abs(e.Sort-epNum) < 0.001 {
				pickEpisodeID = e.EpisodeID
				break
			}
		}
		if pickEpisodeID == "" {
			return fmt.Errorf("episode %v not found in %q (have %d playable episodes)", epNum, anime.Title, len(env.Episodes))
		}

		var resp watchURLResponse
		if err := c.DoJSON("GET", "/api/v1/episodes/"+pickEpisodeID+"/watch-url", nil, nil, &resp); err != nil {
			return fmt.Errorf("watch-url: %w", err)
		}

		if flagJSON {
			return output.PrintJSON(resp)
		}
		output.Printf("Resolved %q ep %v → %s", anime.Title, epNum, resp.WatchURL)
		output.Printf("Stream: %s", resp.StreamURL)
		return nil
	},
}

func init() {
	watchResolveCmd.Flags().Float64("episode", 0, "episode number to resolve (required)")
	watchCmd.AddCommand(watchResolveCmd)
	rootCmd.AddCommand(watchCmd)
}
