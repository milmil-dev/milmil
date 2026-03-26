package ffmpeg

import (
	"context"
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
