package main

import (
	"fmt"
	"os"
	"strconv"

	"github.com/milmil/api/cmd/cli/internal/output"
	"github.com/spf13/cobra"
)

// playableEpisode mirrors the server's playableEpisodeResponse for fields
// the CLI uses. Extra server fields are ignored.
type playableEpisode struct {
	EpisodeID string  `json:"episode_id"`
	Sort      float64 `json:"sort"`
	Title     *string `json:"title"`
	TitleZh   *string `json:"title_zh"`
	AirDate   *string `json:"air_date"`
}

// playableEpisodesEnvelope is the actual server response shape — the
// episodes array is wrapped alongside watch-status / sync-flag fields
// the CLI doesn't use here.
type playableEpisodesEnvelope struct {
	Episodes []playableEpisode `json:"episodes"`
}

type watchURLResponse struct {
	AnimeID     string `json:"anime_id"`
	EpisodeID   string `json:"episode_id"`
	WatchURL    string `json:"watch_url"`
	StreamURL   string `json:"stream_url"`
	MatchedFile string `json:"matched_file"`
}

var episodeCmd = &cobra.Command{
	Use:   "episode",
	Short: "Inspect episodes (list, watch-url)",
}

var episodeListCmd = &cobra.Command{
	Use:   "list --anime-id <bangumi_id>",
	Short: "List playable episodes for a Bangumi-matched anime",
	Long: `Lists local episodes that have at least one matched media file.
The --anime-id is a Bangumi numeric subject ID (the value milmil stores
in anime.bangumi_id), not the local UUID. 'milmil search anime <q>' shows
both columns; pass the 'Bangumi' column value here.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		bangumiID, _ := cmd.Flags().GetInt64("anime-id")
		if bangumiID == 0 {
			return fmt.Errorf("--anime-id (Bangumi numeric ID) is required")
		}
		c, err := newClient()
		if err != nil {
			return err
		}
		var env playableEpisodesEnvelope
		path := fmt.Sprintf("/api/v1/anime/%d/playable-episodes", bangumiID)
		if err := c.DoJSON("GET", path, nil, nil, &env); err != nil {
			return err
		}
		if flagJSON {
			return output.PrintJSON(env.Episodes)
		}
		if len(env.Episodes) == 0 {
			output.Printf("No playable episodes for Bangumi anime %d.", bangumiID)
			return nil
		}
		rows := make([][]string, 0, len(env.Episodes))
		for _, e := range env.Episodes {
			title := ""
			if e.Title != nil {
				title = *e.Title
			}
			rows = append(rows, []string{
				e.EpisodeID,
				strconv.FormatFloat(e.Sort, 'f', -1, 64),
				title,
				strDeref(e.AirDate),
			})
		}
		output.PrintTable(os.Stdout, []string{"Episode ID", "#", "Title", "Aired"}, rows)
		return nil
	},
}

var episodeWatchURLCmd = &cobra.Command{
	Use:   "watch-url <episode_id>",
	Short: "Fetch the canonical web + stream URL for an episode",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		c, err := newClient()
		if err != nil {
			return err
		}
		var resp watchURLResponse
		if err := c.DoJSON("GET", "/api/v1/episodes/"+args[0]+"/watch-url", nil, nil, &resp); err != nil {
			return err
		}
		if flagJSON {
			return output.PrintJSON(resp)
		}
		output.Printf("Watch:  %s", resp.WatchURL)
		output.Printf("Stream: %s", resp.StreamURL)
		output.Printf("File:   %s", resp.MatchedFile)
		return nil
	},
}

func strDeref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func init() {
	episodeListCmd.Flags().Int64("anime-id", 0, "Bangumi anime ID (required)")
	episodeCmd.AddCommand(episodeListCmd, episodeWatchURLCmd)
	rootCmd.AddCommand(episodeCmd)
}
