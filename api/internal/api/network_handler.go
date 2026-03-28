package api

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"

	smb2 "github.com/hirochachacha/go-smb2"
	"github.com/labstack/echo/v4"
)

type discoveredHost struct {
	IP       string   `json:"ip"`
	Hostname string   `json:"hostname"`
	Shares   []string `json:"shares"`
}

type discoverNetworkResponse struct {
	Hosts []discoveredHost `json:"hosts"`
}

func (h *handler) handleDiscoverNetwork(c echo.Context) error {
	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Second)
	defer cancel()

	// Get all local subnets (multiple interfaces)
	subnets := getLocalSubnets()
	if len(subnets) == 0 {
		return c.JSON(http.StatusOK, discoverNetworkResponse{Hosts: []discoveredHost{}})
	}

	// Scan port 445 on all /24 subnets concurrently
	var (
		mu    sync.Mutex
		hosts []discoveredHost
		wg    sync.WaitGroup
		sem   = make(chan struct{}, 64) // max 64 concurrent goroutines
		seen  = make(map[string]bool)
	)

	for _, subnet := range subnets {
		for i := 1; i < 255; i++ {
			ip := fmt.Sprintf("%s.%d", subnet, i)
			if seen[ip] {
				continue
			}
			seen[ip] = true

			select {
			case <-ctx.Done():
				goto done
			default:
			}

			wg.Add(1)
			sem <- struct{}{}

			go func(ip string) {
				defer wg.Done()
				defer func() { <-sem }()

				conn, err := net.DialTimeout("tcp", ip+":445", 2*time.Second)
				if err != nil {
					return
				}
				conn.Close()

				host := discoveredHost{IP: ip}

				// Try to resolve hostname
				names, err := net.LookupAddr(ip)
				if err == nil && len(names) > 0 {
					host.Hostname = names[0]
				}

				// Try to list SMB shares
				shares := listSMBShares(ip)
				host.Shares = shares

				mu.Lock()
				hosts = append(hosts, host)
				mu.Unlock()
			}(ip)
		}
	}

done:
	wg.Wait()

	if hosts == nil {
		hosts = []discoveredHost{}
	}
	return c.JSON(http.StatusOK, discoverNetworkResponse{Hosts: hosts})
}

func getLocalSubnets() []string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return nil
	}
	seen := make(map[string]bool)
	var subnets []string
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() && ipnet.IP.To4() != nil {
			ip := ipnet.IP.To4()
			subnet := fmt.Sprintf("%d.%d.%d", ip[0], ip[1], ip[2])
			if !seen[subnet] {
				seen[subnet] = true
				subnets = append(subnets, subnet)
			}
		}
	}
	return subnets
}

func listSMBShares(ip string) []string {
	// Try multiple auth strategies: anonymous first, then guest
	strategies := []struct {
		user string
		pass string
	}{
		{"", ""},           // anonymous
		{"Guest", ""},      // guest
	}

	for _, cred := range strategies {
		conn, err := net.DialTimeout("tcp", ip+":445", 2*time.Second)
		if err != nil {
			return nil
		}

		d := &smb2.Dialer{
			Initiator: &smb2.NTLMInitiator{
				User:     cred.user,
				Password: cred.pass,
			},
		}

		s, err := d.DialContext(context.Background(), conn)
		if err != nil {
			conn.Close()
			continue
		}

		names, err := s.ListSharenames()
		s.Logoff()
		conn.Close()

		if err != nil {
			continue
		}

		// Filter out admin shares (ending with $)
		var shares []string
		for _, name := range names {
			if len(name) > 0 && name[len(name)-1] != '$' {
				shares = append(shares, name)
			}
		}
		if len(shares) > 0 {
			return shares
		}
	}
	return nil
}
