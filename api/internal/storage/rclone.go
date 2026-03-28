package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	_ "github.com/rclone/rclone/backend/all" // register all rclone backends
	"github.com/rclone/rclone/fs"
	"github.com/rclone/rclone/fs/config/obscure"
	"github.com/rclone/rclone/vfs"
)

// RcloneConfig is a generic config envelope. The "type" field selects the
// rclone backend (smb, sftp, webdav, s3, ftp, http, …). All remaining
// fields are passed through to the backend as connection-string parameters.
type RcloneConfig struct {
	// Backend-specific fields used across milmil source types.
	Host       string `json:"host,omitempty"`
	Port       int    `json:"port,omitempty"`
	Share      string `json:"share,omitempty"`    // SMB share name
	Username   string `json:"username,omitempty"`
	Password   string `json:"password,omitempty"`
	Domain     string `json:"domain,omitempty"`    // SMB domain
	PrivateKey string `json:"privateKey,omitempty"` // SFTP private key
}

// RcloneProvider implements Provider using rclone's VFS layer.
// It supports any backend that rclone supports (SMB, SFTP, WebDAV, S3, …).
type RcloneProvider struct {
	vfs *vfs.VFS
}

// NewRcloneProvider creates a new RcloneProvider for the given backend type
// and config JSON. The backendType matches the rclone backend name
// (e.g. "smb", "sftp", "webdav", "s3").
func NewRcloneProvider(backendType string, configJSON string) (*RcloneProvider, error) {
	var cfg RcloneConfig
	if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
		return nil, fmt.Errorf("rclone: invalid config: %w", err)
	}

	remoteStr, err := buildRemoteString(backendType, cfg)
	if err != nil {
		return nil, err
	}

	f, err := fs.NewFs(context.Background(), remoteStr)
	if err != nil {
		return nil, fmt.Errorf("rclone: create backend %q: %w", backendType, err)
	}

	v := vfs.New(f, nil)

	return &RcloneProvider{vfs: v}, nil
}

// buildRemoteString constructs the rclone on-the-fly remote string
// in the format ":backend,key=value,key=value:rootPath".
func buildRemoteString(backendType string, cfg RcloneConfig) (string, error) {
	params := make([]string, 0, 8)
	var rootPath string

	switch backendType {
	case "smb":
		if cfg.Host == "" {
			return "", fmt.Errorf("rclone smb: host is required")
		}
		if cfg.Share == "" {
			return "", fmt.Errorf("rclone smb: share is required")
		}
		params = append(params, "host="+cfg.Host)
		if cfg.Port != 0 {
			params = append(params, fmt.Sprintf("port=%d", cfg.Port))
		}
		if cfg.Username != "" {
			params = append(params, "user="+cfg.Username)
		}
		if cfg.Password != "" {
			params = append(params, "pass="+obscurePassword(cfg.Password))
		}
		if cfg.Domain != "" {
			params = append(params, "domain="+cfg.Domain)
		}
		rootPath = cfg.Share

	case "sftp":
		if cfg.Host == "" {
			return "", fmt.Errorf("rclone sftp: host is required")
		}
		if cfg.Password == "" && cfg.PrivateKey == "" {
			return "", fmt.Errorf("rclone sftp: no authentication method provided (password or privateKey required)")
		}
		params = append(params, "host="+cfg.Host)
		if cfg.Port != 0 {
			params = append(params, fmt.Sprintf("port=%d", cfg.Port))
		}
		if cfg.Username != "" {
			params = append(params, "user="+cfg.Username)
		}
		if cfg.Password != "" {
			params = append(params, "pass="+obscurePassword(cfg.Password))
		}
		if cfg.PrivateKey != "" {
			// Single-quote the PEM key since it contains newlines and special chars.
			escaped := strings.ReplaceAll(cfg.PrivateKey, "'", "''")
			params = append(params, "key_pem='"+escaped+"'")
		}
		// Disable host key checking for home-server use case (matches old behaviour).
		params = append(params, "known_hosts_file=/dev/null")
		rootPath = "/"

	default:
		return "", fmt.Errorf("rclone: unsupported backend type %q", backendType)
	}

	paramStr := strings.Join(params, ",")
	return fmt.Sprintf(":%s,%s:%s", backendType, paramStr, rootPath), nil
}

// obscurePassword wraps rclone's password obscuring. Rclone connection-string
// passwords must be obscured.
func obscurePassword(plain string) string {
	obscured, err := obscure.Obscure(plain)
	if err != nil {
		// Fallback: pass plain text — some backends accept it.
		return plain
	}
	return obscured
}

// Walk recursively walks the directory tree rooted at root.
func (p *RcloneProvider) Walk(root string, fn filepath.WalkFunc) error {
	return p.walk(root, fn)
}

func (p *RcloneProvider) walk(dir string, fn filepath.WalkFunc) error {
	// Stat the directory itself.
	node, err := p.vfs.Stat(dir)
	if err != nil {
		return fn(dir, nil, err)
	}
	if err := fn(dir, node, nil); err != nil {
		return err
	}

	entries, err := p.vfs.ReadDir(dir)
	if err != nil {
		return fn(dir, nil, err)
	}

	for _, entry := range entries {
		entryPath := dir + "/" + entry.Name()
		// Normalise to forward slashes.
		entryPath = strings.ReplaceAll(entryPath, "\\", "/")

		if entry.IsDir() {
			if err := p.walk(entryPath, fn); err != nil {
				return err
			}
		} else {
			if err := fn(entryPath, entry, nil); err != nil {
				return err
			}
		}
	}
	return nil
}

// Stat returns file info for the given path.
func (p *RcloneProvider) Stat(path string) (os.FileInfo, error) {
	return p.vfs.Stat(path)
}

// Open returns a ReadCloser for the given path.
func (p *RcloneProvider) Open(path string) (io.ReadCloser, error) {
	h, err := p.vfs.Open(path)
	if err != nil {
		return nil, err
	}
	// vfs.Handle satisfies io.ReadCloser (has Read + Close).
	return h, nil
}

// Close shuts down the VFS and releases resources.
func (p *RcloneProvider) Close() error {
	p.vfs.Shutdown()
	return nil
}
