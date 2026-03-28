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

	// WebDAV / HTTP
	URL    string `json:"url,omitempty"`
	Vendor string `json:"vendor,omitempty"` // WebDAV vendor (nextcloud/owncloud/other)

	// S3
	Endpoint  string `json:"endpoint,omitempty"`
	Bucket    string `json:"bucket,omitempty"`
	AccessKey string `json:"access_key,omitempty"`
	SecretKey string `json:"secret_key,omitempty"`
	Region    string `json:"region,omitempty"`

	// OAuth backends (gdrive, onedrive, dropbox) — use pre-configured rclone remote
	RemoteName string `json:"remote_name,omitempty"`
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
		if cfg.Share != "" {
			rootPath = cfg.Share
		} else {
			rootPath = "/"
		}

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

	case "webdav":
		if cfg.URL == "" {
			return "", fmt.Errorf("rclone webdav: url is required")
		}
		params = append(params, "url="+cfg.URL)
		if cfg.Username != "" {
			params = append(params, "user="+cfg.Username)
		}
		if cfg.Password != "" {
			params = append(params, "pass="+obscurePassword(cfg.Password))
		}
		if cfg.Vendor != "" {
			params = append(params, "vendor="+cfg.Vendor)
		}
		rootPath = "/"

	case "s3":
		if cfg.Endpoint == "" {
			return "", fmt.Errorf("rclone s3: endpoint is required")
		}
		if cfg.Bucket == "" {
			return "", fmt.Errorf("rclone s3: bucket is required")
		}
		if cfg.AccessKey == "" {
			return "", fmt.Errorf("rclone s3: access_key is required")
		}
		if cfg.SecretKey == "" {
			return "", fmt.Errorf("rclone s3: secret_key is required")
		}
		params = append(params, "provider=Other")
		params = append(params, "endpoint="+cfg.Endpoint)
		params = append(params, "access_key_id="+cfg.AccessKey)
		params = append(params, "secret_access_key="+cfg.SecretKey)
		if cfg.Region != "" {
			params = append(params, "region="+cfg.Region)
		}
		rootPath = cfg.Bucket

	case "ftp":
		if cfg.Host == "" {
			return "", fmt.Errorf("rclone ftp: host is required")
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
		rootPath = "/"

	case "http":
		if cfg.URL == "" {
			return "", fmt.Errorf("rclone http: url is required")
		}
		params = append(params, "url="+cfg.URL)
		rootPath = "/"

	case "gdrive", "onedrive", "dropbox":
		if cfg.RemoteName == "" {
			return "", fmt.Errorf("rclone %s: remote_name is required", backendType)
		}
		// OAuth backends use a pre-configured rclone remote (set up via `rclone config`).
		// Return "remoteName:/" directly instead of the on-the-fly syntax.
		return cfg.RemoteName + ":/", nil

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

// ReadDir returns directory entries for the given path.
func (p *RcloneProvider) ReadDir(path string) ([]os.FileInfo, error) {
	return p.vfs.ReadDir(path)
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
