package metadata

import (
	"context"
	"fmt"
	"log/slog"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/milmil/api/internal/integration/anilist"
)

const (
	franchiseCacheTTL = 30 * 24 * time.Hour // 30 days
	maxTraversalDepth = 10
)

var franchiseRelations = map[string]bool{
	"PREQUEL":    true,
	"SEQUEL":     true,
	"SIDE_STORY": true,
	"PARENT":     true,
}

type franchiseNode struct {
	media anilist.Media
	edges []anilist.MediaEdge
}

func (s *Service) GetFranchise(ctx context.Context, bangumiID int) (*FranchiseResult, error) {
	detail, err := s.GetAnimeDetail(ctx, bangumiID, false)
	if err != nil {
		return nil, err
	}
	if detail.AniListID == 0 {
		return &FranchiseResult{
			MainSeries: []FranchiseEntry{{
				BangumiID:     detail.BangumiID,
				Title:         detail.Title,
				TitleOriginal: detail.TitleOriginal,
				CoverImage:    detail.CoverImage,
				MediaType:     detail.MediaType,
				AirDate:       detail.AirDate,
				EpisodeCount:  detail.EpisodeCount,
				Score:         detail.Score,
			}},
		}, nil
	}

	startID := detail.AniListID

	refKey := fmt.Sprintf("meta:franchise:v2:ref:%d", startID)
	var rootID int
	if s.getCache(ctx, refKey, &rootID) && rootID > 0 {
		franchiseKey := fmt.Sprintf("meta:franchise:v2:al:%d", rootID)
		var cached FranchiseResult
		if s.getCache(ctx, franchiseKey, &cached) {
			return &cached, nil
		}
	}

	nodes := s.traverseFranchise(ctx, startID)
	result := s.buildFranchiseResult(ctx, nodes, startID)

	if len(result.MainSeries) > 0 {
		rootID = result.MainSeries[0].AniListID
	} else {
		rootID = startID
	}

	franchiseKey := fmt.Sprintf("meta:franchise:v2:al:%d", rootID)
	s.setCache(ctx, franchiseKey, result, franchiseCacheTTL)

	for _, entry := range result.MainSeries {
		rk := fmt.Sprintf("meta:franchise:v2:ref:%d", entry.AniListID)
		s.setCache(ctx, rk, rootID, franchiseCacheTTL)
	}
	for _, entry := range result.SideStories {
		rk := fmt.Sprintf("meta:franchise:v2:ref:%d", entry.AniListID)
		s.setCache(ctx, rk, rootID, franchiseCacheTTL)
	}

	return result, nil
}

func (s *Service) traverseFranchise(ctx context.Context, startID int) map[int]*franchiseNode {
	nodes := make(map[int]*franchiseNode)
	queue := []struct {
		id    int
		depth int
	}{{id: startID, depth: 0}}

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		if _, visited := nodes[current.id]; visited {
			continue
		}
		if current.depth > maxTraversalDepth {
			continue
		}

		media, err := s.anilist.GetMediaRelations(ctx, current.id)
		if err != nil {
			slog.Warn("franchise: failed to fetch media", "anilist_id", current.id, "err", err)
			continue
		}

		node := &franchiseNode{media: *media}
		if media.Relations != nil {
			for _, edge := range media.Relations.Edges {
				if !franchiseRelations[edge.RelationType] {
					continue
				}
				if !isAnimeFormat(edge.Node.Format) {
					continue
				}
				node.edges = append(node.edges, edge)
				if _, visited := nodes[edge.Node.ID]; !visited {
					queue = append(queue, struct {
						id    int
						depth int
					}{id: edge.Node.ID, depth: current.depth + 1})
				}
			}
		}
		nodes[current.id] = node
	}

	return nodes
}

func (s *Service) buildFranchiseResult(ctx context.Context, nodes map[int]*franchiseNode, startID int) *FranchiseResult {
	rootID := startID
	visited := map[int]bool{startID: true}
	for {
		node, ok := nodes[rootID]
		if !ok {
			break
		}
		foundPrequel := false
		for _, edge := range node.edges {
			if edge.RelationType == "PREQUEL" && !visited[edge.Node.ID] {
				visited[edge.Node.ID] = true
				rootID = edge.Node.ID
				foundPrequel = true
				break
			}
		}
		if !foundPrequel {
			break
		}
	}

	mainIDs := map[int]bool{}
	var mainSeries []FranchiseEntry
	currentID := rootID
	chainVisited := map[int]bool{}
	for {
		node, ok := nodes[currentID]
		if !ok {
			break
		}
		if chainVisited[currentID] {
			break
		}
		chainVisited[currentID] = true
		mainIDs[currentID] = true

		entry := mediaToFranchiseEntry(node.media, "")
		entry.BangumiID = s.resolveBangumiIDCached(ctx, currentID)
		mainSeries = append(mainSeries, entry)

		foundSequel := false
		for _, edge := range node.edges {
			if edge.RelationType == "SEQUEL" && !chainVisited[edge.Node.ID] {
				currentID = edge.Node.ID
				foundSequel = true
				break
			}
		}
		if !foundSequel {
			break
		}
	}

	// Number the seasons. Only TV-style entries count; movies, OVAs and
	// specials sitting in the PREQUEL/SEQUEL chain (e.g. 呪術廻戦 0 in front
	// of the first TV season) are demoted to side stories so they never
	// steal an "S1" slot.
	mainSeries, demoted := assignSeasons(mainSeries)
	for _, entry := range demoted {
		delete(mainIDs, entry.AniListID)
	}

	var sideStories []FranchiseEntry
	for id, node := range nodes {
		if mainIDs[id] {
			continue
		}
		relType := determineRelationType(nodes, id, mainIDs)
		entry := mediaToFranchiseEntry(node.media, relType)
		entry.BangumiID = s.resolveBangumiIDCached(ctx, id)
		sideStories = append(sideStories, entry)
	}

	sort.Slice(sideStories, func(i, j int) bool {
		return sideStories[i].AirDate < sideStories[j].AirDate
	})

	return &FranchiseResult{
		MainSeries:  mainSeries,
		SideStories: sideStories,
	}
}

func (s *Service) resolveBangumiIDCached(ctx context.Context, anilistID int) int {
	reverseKey := fmt.Sprintf("meta:xref:al:%d", anilistID)
	var bangumiID int
	if s.getCache(ctx, reverseKey, &bangumiID) && bangumiID > 0 {
		return bangumiID
	}
	// Cache miss — try full resolution (searches Bangumi by title)
	if resolved, err := s.ResolveBangumiID(ctx, anilistID); err == nil && resolved > 0 {
		return resolved
	}
	return 0
}

func determineRelationType(nodes map[int]*franchiseNode, targetID int, mainIDs map[int]bool) string {
	for id, node := range nodes {
		if !mainIDs[id] {
			continue
		}
		for _, edge := range node.edges {
			if edge.Node.ID == targetID {
				return edge.RelationType
			}
		}
	}
	for _, node := range nodes {
		for _, edge := range node.edges {
			if edge.Node.ID == targetID {
				return edge.RelationType
			}
		}
	}
	return "SIDE_STORY"
}

func mediaToFranchiseEntry(m anilist.Media, relationType string) FranchiseEntry {
	title := m.Title.Native
	if title == "" {
		title = m.Title.Romaji
	}
	cover := m.CoverImage.ExtraLarge
	if cover == "" {
		cover = m.CoverImage.Large
	}
	airDate := ""
	if m.SeasonYear > 0 {
		airDate = fmt.Sprintf("%d", m.SeasonYear)
		if month := seasonToMonth(m.Season); month != "" {
			airDate = fmt.Sprintf("%d-%s", m.SeasonYear, month)
		}
	}
	return FranchiseEntry{
		AniListID:     m.ID,
		Title:         title,
		TitleOriginal: m.Title.Romaji,
		TitleEN:       m.Title.English,
		CoverImage:    cover,
		MediaType:     m.Format,
		AirDate:       airDate,
		EpisodeCount:  m.Episodes,
		Score:         float64(m.AverageScore) / 10.0,
		RelationType:  relationType,
	}
}

func isAnimeFormat(format string) bool {
	switch format {
	case "TV", "TV_SHORT", "OVA", "ONA", "MOVIE", "SPECIAL":
		return true
	}
	return false
}

func seasonToMonth(season string) string {
	switch season {
	case "WINTER":
		return "01"
	case "SPRING":
		return "04"
	case "SUMMER":
		return "07"
	case "FALL":
		return "10"
	}
	return ""
}

// numberedFormats are the AniList formats that count as a "season" of the
// main series when numbering S1/S2/…. Everything else in the chain is a
// side story for display purposes.
var numberedFormats = map[string]bool{
	"TV":       true,
	"TV_SHORT": true,
	"ONA":      true,
}

// partMarkers recognise split-cour naming across AniList's romaji, English
// and native titles. Each returns the cour/part number the title claims, or
// 0 when the pattern does not match. A value of 1 means "first part of a
// season" (starts a new season), >= 2 means "continuation of the previous
// entry" (joins its season).
var partMarkers = []func(title string) int{
	regexpPart(`(?i)\bpart\s*(\d+)\b`),
	regexpPart(`(?i)\bcour\s*(\d+)\b`),
	regexpPart(`(?i)\b(\d+)(?:st|nd|rd|th)\s+cour\b`),
	regexpPart(`第([0-9一二三四五六七八九十]+)クール`),
	func(title string) int {
		switch {
		case strings.Contains(title, "前編"), strings.Contains(title, "前半"):
			return 1
		case strings.Contains(title, "後編"), strings.Contains(title, "後半"), strings.Contains(title, "中編"):
			return 2
		}
		return 0
	},
}

func regexpPart(pattern string) func(string) int {
	re := regexp.MustCompile(pattern)
	return func(title string) int {
		m := re.FindStringSubmatch(title)
		if m == nil {
			return 0
		}
		return parseCourNumber(m[1])
	}
}

var kanjiDigits = map[rune]int{'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10}

func parseCourNumber(s string) int {
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	// Kanji numerals: 一..十 and 十一..十九 cover every real split cour.
	total := 0
	for _, r := range s {
		d, ok := kanjiDigits[r]
		if !ok {
			return 0
		}
		if d == 10 {
			if total == 0 {
				total = 10
			} else {
				total *= 10
			}
			continue
		}
		total += d
	}
	return total
}

// partMarker reports which cour a franchise entry's titles claim to be:
// 0 when there is no split-cour marker, 1 for an explicit first part
// (Part 1 / 前編 / 第1クール), >= 2 for a continuation.
func partMarker(e FranchiseEntry) int {
	for _, title := range []string{e.TitleEN, e.TitleOriginal, e.Title} {
		if title == "" {
			continue
		}
		for _, match := range partMarkers {
			if n := match(title); n > 0 {
				return n
			}
		}
	}
	return 0
}

// assignSeasons walks the main-series chain in air order and stamps each
// entry with Season (1-based) and Part (1-based within a split season, 0 for
// a season that aired as one run). Split cours — AniList lists 無職転生
// 第2クール, 呪術廻戦 死滅回游 後編 and friends as their own media — fold
// into the season of the entry before them instead of becoming S(n+1).
//
// Entries whose format is not TV-style are removed from the chain and
// returned as demoted so the caller can file them as side stories. When no
// entry has a TV-style format (an OVA-only series) every entry is kept.
func assignSeasons(chain []FranchiseEntry) (main, demoted []FranchiseEntry) {
	hasNumbered := false
	for _, e := range chain {
		if numberedFormats[e.MediaType] {
			hasNumbered = true
			break
		}
	}
	main = make([]FranchiseEntry, 0, len(chain))
	for _, e := range chain {
		if hasNumbered && !numberedFormats[e.MediaType] {
			demoted = append(demoted, e)
			continue
		}
		main = append(main, e)
	}

	season := 0
	for i := range main {
		if season == 0 || partMarker(main[i]) < 2 {
			season++
		}
		main[i].Season = season
	}
	// Part is only meaningful when a season is split across entries.
	for start := 0; start < len(main); {
		end := start
		for end < len(main) && main[end].Season == main[start].Season {
			end++
		}
		if end-start > 1 {
			for i := start; i < end; i++ {
				main[i].Part = i - start + 1
			}
		}
		start = end
	}
	return main, demoted
}
