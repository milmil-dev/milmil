package ffmpeg

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// SpriteSheetResult holds paths to generated sprite assets.
type SpriteSheetResult struct {
	SpritePath string // Path to the sprite sheet image (JPEG)
	VTTPath    string // Path to the WebVTT file
	Cols       int    // Number of columns in the sprite grid
	Rows       int    // Number of rows in the sprite grid
	TileWidth  int    // Width of each tile in pixels
	TileHeight int    // Height of each tile in pixels
	Count      int    // Total number of thumbnails generated
	Interval   int    // Seconds between each thumbnail
}

// GenerateSpriteSheet extracts thumbnails from a video at regular intervals
// and compiles them into a single sprite sheet image with a companion WebVTT file.
//
// interval: seconds between thumbnails (e.g. 10 for one every 10 seconds)
// tileWidth: width of each thumbnail tile (height is auto-calculated to preserve aspect ratio)
func GenerateSpriteSheet(ctx context.Context, inputPath, outputDir string, durationSeconds, interval, tileWidth int) (*SpriteSheetResult, error) {
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return nil, err
	}

	if interval <= 0 {
		interval = 10
	}
	if tileWidth <= 0 {
		tileWidth = 160
	}

	count := durationSeconds / interval
	if count <= 0 {
		count = 1
	}
	// Cap at 200 thumbnails max
	if count > 200 {
		interval = durationSeconds / 200
		count = 200
	}

	// Use 10 columns per row
	cols := 10
	if count < cols {
		cols = count
	}
	rows := (count + cols - 1) / cols

	tileHeight := tileWidth * 9 / 16 // Assume 16:9 aspect ratio

	spritePath := filepath.Join(outputDir, "sprite.jpg")

	// FFmpeg: extract one frame every N seconds, scale to tileWidth, tile into a sprite sheet
	// fps=1/interval extracts frames at the interval rate
	// scale sets width (height auto with -1)
	// tile arranges into a grid
	filter := fmt.Sprintf("fps=1/%d,scale=%d:-1,tile=%dx%d", interval, tileWidth, cols, rows)

	// -skip_frame nokey decodes keyframes only. The fps filter then holds the
	// nearest keyframe for each slot, which is indistinguishable at 160 px and
	// several times faster than decoding every frame of the episode.
	args := []string{
		"-skip_frame", "nokey",
		"-i", inputPath,
		"-frames:v", "1",
		"-vf", filter,
		"-q:v", "5",
		"-y",
		spritePath,
	}

	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("ffmpeg sprite generation failed: %w\n%s", err, string(output))
	}

	// Generate WebVTT file
	vttPath := filepath.Join(outputDir, "thumbnails.vtt")
	if err := generateVTT(vttPath, "sprite.jpg", count, interval, cols, tileWidth, tileHeight); err != nil {
		return nil, err
	}

	return &SpriteSheetResult{
		SpritePath: spritePath,
		VTTPath:    vttPath,
		Cols:       cols,
		Rows:       rows,
		TileWidth:  tileWidth,
		TileHeight: tileHeight,
		Count:      count,
		Interval:   interval,
	}, nil
}

func generateVTT(vttPath, spriteFilename string, count, interval, cols, tileWidth, tileHeight int) error {
	var b strings.Builder
	b.WriteString("WEBVTT\n\n")

	for i := 0; i < count; i++ {
		startSec := i * interval
		endSec := (i + 1) * interval

		startTime := formatVTTTime(startSec)
		endTime := formatVTTTime(endSec)

		col := i % cols
		row := i / cols
		x := col * tileWidth
		y := row * tileHeight

		fmt.Fprintf(&b, "%s --> %s\n", startTime, endTime)
		fmt.Fprintf(&b, "%s#xywh=%d,%d,%d,%d\n\n", spriteFilename, x, y, tileWidth, tileHeight)
	}

	return os.WriteFile(vttPath, []byte(b.String()), 0644)
}

func formatVTTTime(totalSeconds int) string {
	h := totalSeconds / 3600
	m := (totalSeconds % 3600) / 60
	s := totalSeconds % 60
	return fmt.Sprintf("%02d:%02d:%02d.000", h, m, s)
}
