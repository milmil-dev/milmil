package storage

import (
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"

	"github.com/hirochachacha/go-smb2"
)

// SMBConfig holds connection details for an SMB/CIFS share.
type SMBConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`     // default 445
	Share    string `json:"share"`    // share name, e.g. "media"
	Username string `json:"username"`
	Password string `json:"password"`
	Domain   string `json:"domain"`
}

// SMBProvider implements Provider over an SMB/CIFS network share.
type SMBProvider struct {
	conn    net.Conn
	session *smb2.Session
	share   *smb2.Share
}

// NewSMBProvider dials the SMB server, authenticates via NTLM, and mounts the
// requested share.
func NewSMBProvider(cfg SMBConfig) (*SMBProvider, error) {
	if cfg.Host == "" {
		return nil, fmt.Errorf("smb: host is required")
	}
	if cfg.Share == "" {
		return nil, fmt.Errorf("smb: share is required")
	}
	port := cfg.Port
	if port == 0 {
		port = 445
	}

	addr := fmt.Sprintf("%s:%d", cfg.Host, port)
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("smb: dial %s: %w", addr, err)
	}

	dialer := &smb2.Dialer{
		Initiator: &smb2.NTLMInitiator{
			User:     cfg.Username,
			Password: cfg.Password,
			Domain:   cfg.Domain,
		},
	}

	session, err := dialer.Dial(conn)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("smb: session dial: %w", err)
	}

	share, err := session.Mount(cfg.Share)
	if err != nil {
		session.Logoff()
		conn.Close()
		return nil, fmt.Errorf("smb: mount %q: %w", cfg.Share, err)
	}

	return &SMBProvider{
		conn:    conn,
		session: session,
		share:   share,
	}, nil
}

// Walk recursively walks the directory tree rooted at root on the SMB share.
func (p *SMBProvider) Walk(root string, fn filepath.WalkFunc) error {
	return p.walk(root, fn)
}

func (p *SMBProvider) walk(dir string, fn filepath.WalkFunc) error {
	entries, err := p.share.ReadDir(dir)
	if err != nil {
		return fn(dir, nil, err)
	}

	// Call fn for the directory itself.
	dirInfo, err := p.share.Stat(dir)
	if err != nil {
		return fn(dir, nil, err)
	}
	if err := fn(dir, dirInfo, nil); err != nil {
		return err
	}

	for _, entry := range entries {
		path := dir + "/" + entry.Name()
		// Normalise to forward slashes for consistency.
		path = strings.ReplaceAll(path, "\\", "/")

		if entry.IsDir() {
			if err := p.walk(path, fn); err != nil {
				return err
			}
		} else {
			if err := fn(path, entry, nil); err != nil {
				return err
			}
		}
	}
	return nil
}

// Stat returns file info for the given path on the SMB share.
func (p *SMBProvider) Stat(path string) (os.FileInfo, error) {
	return p.share.Stat(path)
}

// Open returns a ReadCloser for the given path on the SMB share.
func (p *SMBProvider) Open(path string) (io.ReadCloser, error) {
	return p.share.Open(path)
}

// Close unmounts the share, logs off the session, and closes the TCP
// connection.
func (p *SMBProvider) Close() error {
	var firstErr error
	if p.share != nil {
		if err := p.share.Umount(); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	if p.session != nil {
		if err := p.session.Logoff(); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	if p.conn != nil {
		if err := p.conn.Close(); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}
