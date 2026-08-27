package api

import (
	"net"
	"testing"
)

func TestIsPublicIP(t *testing.T) {
	blocked := []string{
		"127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1",
		"169.254.169.254", "0.0.0.0", "100.64.0.1",
		"::1", "fd00::1", "fe80::1",
	}
	for _, addr := range blocked {
		if isPublicIP(net.ParseIP(addr)) {
			t.Errorf("%s: want blocked", addr)
		}
	}
	for _, addr := range []string{"1.1.1.1", "104.21.0.1", "99.63.255.255", "101.0.0.1", "2606:4700::1111"} {
		if !isPublicIP(net.ParseIP(addr)) {
			t.Errorf("%s: want allowed", addr)
		}
	}
}

func TestBlockPrivateDial(t *testing.T) {
	if err := blockPrivateDial("tcp", "127.0.0.1:80", nil); err == nil {
		t.Error("loopback: want refusal")
	}
	if err := blockPrivateDial("tcp", "169.254.169.254:80", nil); err == nil {
		t.Error("link-local metadata service: want refusal")
	}
	if err := blockPrivateDial("tcp", "1.1.1.1:443", nil); err != nil {
		t.Errorf("public address: %v", err)
	}
}
