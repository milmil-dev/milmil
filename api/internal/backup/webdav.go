// Package backup provides upload/download helpers for preference backup targets.
package backup

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const webdavPath = "milmil/preferences.json"

// UploadWebDAV uploads data to the given WebDAV URL using a PUT request with Basic Auth.
// It first ensures the parent collection exists by issuing a MKCOL request.
func UploadWebDAV(baseURL, username, password string, data []byte) error {
	client := &http.Client{Timeout: 30 * time.Second}

	base := strings.TrimRight(baseURL, "/")

	// Ensure the milmil/ collection exists (ignore errors — some servers auto-create).
	mkcolURL := base + "/milmil/"
	mkReq, err := http.NewRequest("MKCOL", mkcolURL, nil)
	if err == nil {
		mkReq.SetBasicAuth(username, password)
		resp, _ := client.Do(mkReq) //nolint:errcheck
		if resp != nil {
			resp.Body.Close()
		}
	}

	// PUT the data.
	url := base + "/" + webdavPath
	req, err := http.NewRequest(http.MethodPut, url, strings.NewReader(string(data)))
	if err != nil {
		return fmt.Errorf("backup/webdav: create request: %w", err)
	}
	req.SetBasicAuth(username, password)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("backup/webdav: upload: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("backup/webdav: upload failed (HTTP %d): %s", resp.StatusCode, string(body))
	}
	return nil
}

// DownloadWebDAV downloads preference data from the given WebDAV URL using a GET request.
func DownloadWebDAV(baseURL, username, password string) ([]byte, error) {
	client := &http.Client{Timeout: 30 * time.Second}

	base := strings.TrimRight(baseURL, "/")
	url := base + "/" + webdavPath

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("backup/webdav: create request: %w", err)
	}
	req.SetBasicAuth(username, password)

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("backup/webdav: download: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("backup/webdav: download failed (HTTP %d)", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("backup/webdav: read body: %w", err)
	}
	return body, nil
}

// TestWebDAV checks connectivity by issuing an OPTIONS request to the WebDAV server.
func TestWebDAV(baseURL, username, password string) error {
	client := &http.Client{Timeout: 10 * time.Second}

	base := strings.TrimRight(baseURL, "/")
	req, err := http.NewRequest("OPTIONS", base+"/", nil)
	if err != nil {
		return fmt.Errorf("backup/webdav: create request: %w", err)
	}
	req.SetBasicAuth(username, password)

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("backup/webdav: connection failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return fmt.Errorf("backup/webdav: authentication failed")
	}
	if resp.StatusCode >= 400 {
		return fmt.Errorf("backup/webdav: server returned HTTP %d", resp.StatusCode)
	}
	return nil
}
