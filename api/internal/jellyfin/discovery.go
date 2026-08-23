package jellyfin

import (
	"encoding/json"
	"log/slog"
	"net"
)

const discoveryPort = 7359
const discoveryQuery = "Who is JellyfinServer?"

// StartDiscoveryServer listens on UDP port 7359 for Jellyfin client discovery broadcasts.
// Runs in its own goroutine. Returns a function to stop the server.
func StartDiscoveryServer(serverID, serverName, address string) (stop func(), err error) {
	addr := net.UDPAddr{Port: discoveryPort}
	conn, err := net.ListenUDP("udp", &addr)
	if err != nil {
		return nil, err
	}

	response, _ := json.Marshal(DiscoveryResponse{
		Address: address,
		ID:      serverID,
		Name:    serverName,
	})

	done := make(chan struct{})
	go func() {
		buf := make([]byte, 1024)
		for {
			select {
			case <-done:
				return
			default:
			}
			n, remote, err := conn.ReadFromUDP(buf)
			if err != nil {
				continue
			}
			msg := string(buf[:n])
			if msg == discoveryQuery {
				slog.Info("jellyfin discovery: client found us", "remote", remote.String())
				if _, err := conn.WriteToUDP(response, remote); err != nil {
					slog.Debug("jellyfin discovery: reply failed", "remote", remote.String(), "err", err)
				}
			}
		}
	}()

	return func() {
		close(done)
		conn.Close()
	}, nil
}
