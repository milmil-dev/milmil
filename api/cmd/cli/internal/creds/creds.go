// Package creds reads and writes the milmil CLI's credentials file at
// ~/.config/milmil/credentials. Falls back to MILMIL_SERVER + MILMIL_TOKEN
// env vars (both must be set) when the file is absent.
package creds

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

type Credentials struct {
	Server string `json:"server"`
	Token  string `json:"token"`
}

// ErrNotLoggedIn is returned by Load when neither the credentials file nor
// the env-var fallback is configured. Callers should print a clear "run
// 'milmil auth login'" hint rather than the raw error.
var ErrNotLoggedIn = errors.New("not logged in (run 'milmil auth login')")

func defaultPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".config", "milmil", "credentials"), nil
}

// Load returns the active credentials, preferring env-var overrides.
func Load() (*Credentials, error) {
	if s, t := os.Getenv("MILMIL_SERVER"), os.Getenv("MILMIL_TOKEN"); s != "" && t != "" {
		return &Credentials{Server: s, Token: t}, nil
	}

	path, err := defaultPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, ErrNotLoggedIn
		}
		return nil, fmt.Errorf("read credentials: %w", err)
	}
	c := &Credentials{}
	if err := json.Unmarshal(data, c); err != nil {
		return nil, fmt.Errorf("parse credentials: %w", err)
	}
	if c.Server == "" || c.Token == "" {
		return nil, ErrNotLoggedIn
	}
	return c, nil
}

// Save writes credentials to ~/.config/milmil/credentials with mode 0600.
// The parent directory is created with mode 0700 if missing.
func Save(c *Credentials) error {
	path, err := defaultPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

// Delete removes the credentials file. Missing-file is not an error.
func Delete() error {
	path, err := defaultPath()
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return nil
}
