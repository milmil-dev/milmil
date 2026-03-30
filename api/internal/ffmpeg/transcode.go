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
