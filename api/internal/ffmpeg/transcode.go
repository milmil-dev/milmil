package ffmpeg

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

type TranscodeOptions struct {
	InputPath  string
	OutputDir  string
	Codec      string
	Resolution string
}

// Remux re-wraps a video file into MP4 without re-encoding.
// Very fast (seconds) — only changes the container, keeps video/audio codecs.
// Blocks until FFmpeg finishes — call in a goroutine.
func Remux(ctx context.Context, inputPath, outputPath string) error {
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return err
	}

	args := []string{
		"-i", inputPath,
		"-c:v", "copy",
		"-c:a", "copy",
		"-movflags", "+faststart",
		"-f", "mp4",
		"-y",
		outputPath,
	}

	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	return cmd.Run()
}

// Transcode converts a video file to HLS segments using FFmpeg.
// Blocks until FFmpeg finishes — call in a goroutine.
func Transcode(ctx context.Context, opts TranscodeOptions) error {
	if err := os.MkdirAll(opts.OutputDir, 0755); err != nil {
		return err
	}

	outputPath := filepath.Join(opts.OutputDir, "master.m3u8")

	vf := "scale=-2:1080"
	switch opts.Resolution {
	case "720p":
		vf = "scale=-2:720"
	case "480p":
		vf = "scale=-2:480"
	}

	args := []string{
		"-i", opts.InputPath,
		"-c:v", "libx264",
		"-preset", "fast",
		"-crf", "23",
		"-c:a", "aac",
		"-b:a", "192k",
		"-vf", vf,
		"-f", "hls",
		"-hls_time", "6",
		"-hls_list_size", "0",
		"-hls_segment_filename", filepath.Join(opts.OutputDir, "segment_%03d.ts"),
		outputPath,
	}

	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	return cmd.Run()
}

// EmbeddedSubtitle describes a subtitle stream inside a container.
type EmbeddedSubtitle struct {
	Index    int
	Codec    string
	Language string
	Title    string
}

// ProbeSubtitles returns embedded subtitle streams from a media file.
func ProbeSubtitles(ctx context.Context, inputPath string) ([]EmbeddedSubtitle, error) {
	cmd := exec.CommandContext(ctx, "ffprobe",
		"-v", "quiet", "-print_format", "json",
		"-show_streams", "-select_streams", "s",
		inputPath,
	)
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	var result struct {
		Streams []struct {
			Index     int               `json:"index"`
			CodecName string            `json:"codec_name"`
			Tags      map[string]string `json:"tags"`
		} `json:"streams"`
	}
	if err := json.Unmarshal(out, &result); err != nil {
		return nil, err
	}
	subs := make([]EmbeddedSubtitle, 0, len(result.Streams))
	for _, s := range result.Streams {
		subs = append(subs, EmbeddedSubtitle{
			Index: s.Index, Codec: s.CodecName,
			Language: s.Tags["language"], Title: s.Tags["title"],
		})
	}
	return subs, nil
}

// ExtractSubtitle extracts a single subtitle stream to an external file.
func ExtractSubtitle(ctx context.Context, inputPath string, streamIndex int, outputPath string) error {
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, "ffmpeg",
		"-i", inputPath,
		"-map", fmt.Sprintf("0:%d", streamIndex),
		"-c:s", "copy", "-y", outputPath,
	)
	return cmd.Run()
}
