package storage

import (
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

// SFTPConfig holds the connection parameters for an SFTP storage provider.
type SFTPConfig struct {
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	Password   string `json:"password"`
	PrivateKey string `json:"privateKey"`
}

// SFTPProvider implements Provider over an SFTP connection.
type SFTPProvider struct {
	sshClient  *ssh.Client
	sftpClient *sftp.Client
}

// NewSFTPProvider dials the remote host and returns an SFTPProvider.
func NewSFTPProvider(cfg SFTPConfig) (*SFTPProvider, error) {
	if cfg.Port == 0 {
		cfg.Port = 22
	}

	var authMethods []ssh.AuthMethod
	if cfg.Password != "" {
		authMethods = append(authMethods, ssh.Password(cfg.Password))
	}
	if cfg.PrivateKey != "" {
		signer, err := ssh.ParsePrivateKey([]byte(cfg.PrivateKey))
		if err != nil {
			return nil, fmt.Errorf("sftp: parse private key: %w", err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	}
	if len(authMethods) == 0 {
		return nil, fmt.Errorf("sftp: no authentication method provided (password or privateKey required)")
	}

	sshCfg := &ssh.ClientConfig{
		User:            cfg.Username,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), //nolint:gosec // home-server use case
	}

	addr := net.JoinHostPort(cfg.Host, fmt.Sprintf("%d", cfg.Port))
	sshClient, err := ssh.Dial("tcp", addr, sshCfg)
	if err != nil {
		return nil, fmt.Errorf("sftp: ssh dial %s: %w", addr, err)
	}

	sftpClient, err := sftp.NewClient(sshClient)
	if err != nil {
		sshClient.Close()
		return nil, fmt.Errorf("sftp: new client: %w", err)
	}

	return &SFTPProvider{
		sshClient:  sshClient,
		sftpClient: sftpClient,
	}, nil
}

func (p *SFTPProvider) Walk(root string, fn filepath.WalkFunc) error {
	walker := p.sftpClient.Walk(root)
	for walker.Step() {
		if err := fn(walker.Path(), walker.Stat(), walker.Err()); err != nil {
			return err
		}
	}
	return walker.Err()
}

func (p *SFTPProvider) Stat(path string) (os.FileInfo, error) {
	return p.sftpClient.Stat(path)
}

func (p *SFTPProvider) Open(path string) (io.ReadCloser, error) {
	return p.sftpClient.Open(path)
}

func (p *SFTPProvider) Close() error {
	sftpErr := p.sftpClient.Close()
	sshErr := p.sshClient.Close()
	if sftpErr != nil {
		return sftpErr
	}
	return sshErr
}
