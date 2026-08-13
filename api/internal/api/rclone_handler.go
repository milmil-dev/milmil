package api

import (
	"bufio"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/labstack/echo/v5"
)

type rcloneRemote struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type listRcloneRemotesResponse struct {
	Remotes []rcloneRemote `json:"remotes"`
}

// handleListRcloneRemotes reads the user's rclone.conf and returns the
// configured remote names with their backend types.
//
// GET /api/v1/rclone/remotes
func (h *handler) handleListRcloneRemotes(c *echo.Context) error {
	confPath := rcloneConfigPath()
	if confPath == "" {
		return c.JSON(http.StatusOK, listRcloneRemotesResponse{Remotes: []rcloneRemote{}})
	}

	remotes, err := parseRcloneConfig(confPath)
	if err != nil {
		return c.JSON(http.StatusOK, listRcloneRemotesResponse{Remotes: []rcloneRemote{}})
	}

	return c.JSON(http.StatusOK, listRcloneRemotesResponse{Remotes: remotes})
}

// rcloneConfigPath returns the path to rclone.conf, checking
// RCLONE_CONFIG env var first, then the default location.
func rcloneConfigPath() string {
	if p := os.Getenv("RCLONE_CONFIG"); p != "" {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}

	p := filepath.Join(home, ".config", "rclone", "rclone.conf")
	if _, err := os.Stat(p); err == nil {
		return p
	}
	return ""
}

// parseRcloneConfig reads an INI-style rclone.conf and extracts
// section names (remote names) and their "type" fields.
func parseRcloneConfig(path string) ([]rcloneRemote, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var remotes []rcloneRemote
	var current string

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// Skip empty lines and comments.
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") {
			continue
		}

		// Section header: [remote-name]
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			current = line[1 : len(line)-1]
			continue
		}

		// Key = value within a section.
		if current != "" {
			if key, value, ok := strings.Cut(line, "="); ok {
				key = strings.TrimSpace(key)
				value = strings.TrimSpace(value)
				if key == "type" {
					remotes = append(remotes, rcloneRemote{
						Name: current,
						Type: value,
					})
					current = "" // done with this section
				}
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	return remotes, nil
}
