package renamer

import (
	"path/filepath"
	"strings"

	"github.com/milmil/api/internal/matcher/fileparse"
	"github.com/milmil/api/internal/store"
)

// TemplateContext is the set of variables exposed to rename templates.
type TemplateContext struct {
	Title            string
	TitleEn          string
	TitleZh          string
	Year             int
	Season           int
	EpisodeNumber    float64
	EpisodeTitle     string
	EpisodeTitleZh   string
	Resolution       int
	Subgroup         string
	Ext              string
	OriginalFilename string
}

// BuildVariables assembles a TemplateContext from the DB records plus
// heuristically parsed data from the current filename (for Resolution and
// Subgroup, which aren't stored on MediaFile).
func BuildVariables(mf store.MediaFile, anime store.Anime, episode store.Episode) TemplateContext {
	parsed := fileparse.Parse(mf.Filename)
	ctx := TemplateContext{
		Title:            anime.Title,
		EpisodeNumber:    episode.EpisodeNumber,
		Resolution:       parsed.Resolution,
		Subgroup:         parsed.SubGroup,
		Ext:              strings.TrimPrefix(filepath.Ext(mf.Filename), "."),
		OriginalFilename: mf.Filename,
		Season:           1,
	}
	if anime.TitleEn.Valid {
		ctx.TitleEn = anime.TitleEn.String
	}
	if anime.TitleZh.Valid {
		ctx.TitleZh = anime.TitleZh.String
	}
	if anime.Year.Valid {
		ctx.Year = int(anime.Year.Int64)
	}
	if episode.Title.Valid {
		ctx.EpisodeTitle = episode.Title.String
	}
	if episode.TitleZh.Valid {
		ctx.EpisodeTitleZh = episode.TitleZh.String
	}
	return ctx
}
