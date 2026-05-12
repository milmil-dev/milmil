package metadata

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
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

	refKey := fmt.Sprintf("meta:franchise:ref:%d", startID)
	var rootID int
	if s.getCache(ctx, refKey, &rootID) && rootID > 0 {
		franchiseKey := fmt.Sprintf("meta:franchise:al:%d", rootID)
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

	franchiseKey := fmt.Sprintf("meta:franchise:al:%d", rootID)
	s.setCache(ctx, franchiseKey, result, franchiseCacheTTL)

	for _, entry := range result.MainSeries {
		rk := fmt.Sprintf("meta:franchise:ref:%d", entry.AniListID)
		s.setCache(ctx, rk, rootID, franchiseCacheTTL)
	}
	for _, entry := range result.SideStories {
		rk := fmt.Sprintf("meta:franchise:ref:%d", entry.AniListID)
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
