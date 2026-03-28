package storage

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestRcloneSFTP_NoAuth(t *testing.T) {
	_, err := NewRcloneProvider("sftp", `{"host": "localhost", "username": "user"}`)
	// Username alone without password or privateKey should fail.
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "no authentication method provided")
}

func TestRcloneSFTP_MissingHost(t *testing.T) {
	_, err := NewRcloneProvider("sftp", `{"username": "user", "password": "pass"}`)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "host is required")
}

func TestBuildRemoteString_SFTP(t *testing.T) {
	cfg := RcloneConfig{
		Host:     "192.168.1.100",
		Port:     22,
		Username: "user",
		Password: "secret",
	}
	remote, err := buildRemoteString("sftp", cfg)
	assert.NoError(t, err)
	assert.Contains(t, remote, ":sftp,")
	assert.Contains(t, remote, "host=192.168.1.100")
	assert.Contains(t, remote, "user=user")
	assert.Contains(t, remote, "known_hosts_file=/dev/null")
}

func TestBuildRemoteString_UnsupportedBackend(t *testing.T) {
	_, err := buildRemoteString("foobar", RcloneConfig{})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "unsupported backend type")
}
