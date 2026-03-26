package aria2

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

var (
	ErrRPCFailed   = errors.New("aria2: RPC error")
	ErrUnavailable = errors.New("aria2: service unavailable")
)

type Client interface {
	AddURI(ctx context.Context, uris []string, options map[string]string) (string, error)
	Pause(ctx context.Context, gid string) error
	Resume(ctx context.Context, gid string) error
	Remove(ctx context.Context, gid string) error
	GetStatus(ctx context.Context, gid string) (*Status, error)
	ListActive(ctx context.Context) ([]Status, error)
}

type httpClient struct {
	http  *http.Client
	url   string
	token string
}

func NewClient(c *http.Client, rpcURL, secret string) Client {
	return &httpClient{http: c, url: rpcURL, token: secret}
}

func NewClientWithURL(c *http.Client, rpcURL, secret string) Client {
	return &httpClient{http: c, url: rpcURL, token: secret}
}

func (c *httpClient) call(ctx context.Context, method string, params ...any) (json.RawMessage, error) {
	rpcParams := make([]any, 0, len(params)+1)
	if c.token != "" {
		rpcParams = append(rpcParams, "token:"+c.token)
	}
	rpcParams = append(rpcParams, params...)

	body, _ := json.Marshal(rpcRequest{
		JSONRPC: "2.0",
		ID:      "milmil",
		Method:  method,
		Params:  rpcParams,
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}

	var rpcResp rpcResponse
	if err := json.Unmarshal(data, &rpcResp); err != nil {
		return nil, err
	}
	if rpcResp.Error != nil {
		return nil, fmt.Errorf("%w: %s", ErrRPCFailed, rpcResp.Error.Message)
	}

	return rpcResp.Result, nil
}

func (c *httpClient) AddURI(ctx context.Context, uris []string, options map[string]string) (string, error) {
	result, err := c.call(ctx, "aria2.addUri", uris, options)
	if err != nil {
		return "", err
	}
	var gid string
	json.Unmarshal(result, &gid)
	return gid, nil
}

func (c *httpClient) Pause(ctx context.Context, gid string) error {
	_, err := c.call(ctx, "aria2.pause", gid)
	return err
}

func (c *httpClient) Resume(ctx context.Context, gid string) error {
	_, err := c.call(ctx, "aria2.unpause", gid)
	return err
}

func (c *httpClient) Remove(ctx context.Context, gid string) error {
	_, err := c.call(ctx, "aria2.remove", gid)
	return err
}

func (c *httpClient) GetStatus(ctx context.Context, gid string) (*Status, error) {
	result, err := c.call(ctx, "aria2.tellStatus", gid)
	if err != nil {
		return nil, err
	}
	var s Status
	json.Unmarshal(result, &s)
	return &s, nil
}

func (c *httpClient) ListActive(ctx context.Context) ([]Status, error) {
	result, err := c.call(ctx, "aria2.tellActive")
	if err != nil {
		return nil, err
	}
	var statuses []Status
	json.Unmarshal(result, &statuses)
	return statuses, nil
}
