package storage

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// --- WebDAV ---

func TestBuildRemoteString_WebDAV(t *testing.T) {
	cfg := RcloneConfig{
		URL:      "https://nextcloud.example.com/remote.php/dav/files/user/",
		Username: "user",
		Password: "pass",
		Vendor:   "nextcloud",
	}
	remote, err := buildRemoteString("webdav", cfg)
	assert.NoError(t, err)
	assert.Contains(t, remote, ":webdav,")
	assert.Contains(t, remote, "url=https://nextcloud.example.com/remote.php/dav/files/user/")
	assert.Contains(t, remote, "user=user")
	assert.Contains(t, remote, "vendor=nextcloud")
	// Password should be obscured, so it should NOT contain the plain text.
	assert.NotContains(t, remote, "pass=pass")
	assert.Contains(t, remote, "pass=")
}

func TestBuildRemoteString_WebDAV_MissingURL(t *testing.T) {
	_, err := buildRemoteString("webdav", RcloneConfig{Username: "user"})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "url is required")
}

// --- S3 ---

func TestBuildRemoteString_S3(t *testing.T) {
	cfg := RcloneConfig{
		Endpoint:  "https://s3.amazonaws.com",
		Bucket:    "my-bucket",
		AccessKey: "AKIAIOSFODNN7EXAMPLE",
		SecretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
		Region:    "us-east-1",
	}
	remote, err := buildRemoteString("s3", cfg)
	assert.NoError(t, err)
	assert.Contains(t, remote, ":s3,")
	assert.Contains(t, remote, "provider=Other")
	assert.Contains(t, remote, "endpoint=https://s3.amazonaws.com")
	assert.Contains(t, remote, "access_key_id=AKIAIOSFODNN7EXAMPLE")
	assert.Contains(t, remote, "secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY")
	assert.Contains(t, remote, "region=us-east-1")
	// Bucket should be the root path, not a param.
	assert.True(t, len(remote) > 0)
	assert.Contains(t, remote, ":my-bucket")
}

func TestBuildRemoteString_S3_MissingEndpoint(t *testing.T) {
	_, err := buildRemoteString("s3", RcloneConfig{Bucket: "b", AccessKey: "a", SecretKey: "s"})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "endpoint is required")
}

func TestBuildRemoteString_S3_MissingBucket(t *testing.T) {
	_, err := buildRemoteString("s3", RcloneConfig{Endpoint: "e", AccessKey: "a", SecretKey: "s"})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "bucket is required")
}

func TestBuildRemoteString_S3_MissingAccessKey(t *testing.T) {
	_, err := buildRemoteString("s3", RcloneConfig{Endpoint: "e", Bucket: "b", SecretKey: "s"})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "access_key is required")
}

func TestBuildRemoteString_S3_MissingSecretKey(t *testing.T) {
	_, err := buildRemoteString("s3", RcloneConfig{Endpoint: "e", Bucket: "b", AccessKey: "a"})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "secret_key is required")
}

// --- FTP ---

func TestBuildRemoteString_FTP(t *testing.T) {
	cfg := RcloneConfig{
		Host:     "ftp.example.com",
		Port:     21,
		Username: "user",
		Password: "pass",
	}
	remote, err := buildRemoteString("ftp", cfg)
	assert.NoError(t, err)
	assert.Contains(t, remote, ":ftp,")
	assert.Contains(t, remote, "host=ftp.example.com")
	assert.Contains(t, remote, "port=21")
	assert.Contains(t, remote, "user=user")
	// Password should be obscured.
	assert.NotContains(t, remote, "pass=pass")
	assert.Contains(t, remote, "pass=")
}

func TestBuildRemoteString_FTP_MissingHost(t *testing.T) {
	_, err := buildRemoteString("ftp", RcloneConfig{Username: "user"})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "host is required")
}

// --- HTTP ---

func TestBuildRemoteString_HTTP(t *testing.T) {
	cfg := RcloneConfig{
		URL: "https://example.com/media/",
	}
	remote, err := buildRemoteString("http", cfg)
	assert.NoError(t, err)
	assert.Contains(t, remote, ":http,")
	assert.Contains(t, remote, "url=https://example.com/media/")
}

func TestBuildRemoteString_HTTP_MissingURL(t *testing.T) {
	_, err := buildRemoteString("http", RcloneConfig{})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "url is required")
}
