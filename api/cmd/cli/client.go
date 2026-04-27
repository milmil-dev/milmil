package main

import (
	"github.com/milmil/api/cmd/cli/internal/creds"
	"github.com/milmil/api/cmd/cli/internal/httpclient"
)

// newClient builds an httpclient using the persistent --server/--token
// flags first, then ~/.config/milmil/credentials, then MILMIL_SERVER /
// MILMIL_TOKEN env vars (handled inside creds.Load). Returns
// creds.ErrNotLoggedIn when neither source is configured so callers can
// suggest 'milmil auth login'.
func newClient() (*httpclient.Client, error) {
	server, token := flagServer, flagToken
	if server == "" || token == "" {
		c, err := creds.Load()
		if err != nil {
			return nil, err
		}
		if server == "" {
			server = c.Server
		}
		if token == "" {
			token = c.Token
		}
	}
	return httpclient.New(server, token), nil
}
