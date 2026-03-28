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

	// Collect all IPs to scan
	seen := make(map[string]bool)
	var ips []string
	for _, subnet := range subnets {
		for i := 1; i < 255; i++ {
			ip := fmt.Sprintf("%s.%d", subnet, i)
			if !seen[ip] {
				seen[ip] = true
				ips = append(ips, ip)
			}
		}
	}

	// Scan port 445 concurrently with proper cancellation
	var (
		mu    sync.Mutex
		hosts []discoveredHost
		wg    sync.WaitGroup
	)

	sem := make(chan struct{}, 64)

	for _, ip := range ips {
		select {
		case <-ctx.Done():
			break
		case sem <- struct{}{}:
		}

		select {
		case <-ctx.Done():
			break
		default:
		}

		wg.Add(1)
		go func(ip string) {
			defer wg.Done()
			defer func() { <-sem }()

			// Quick TCP probe
			d := net.Dialer{Timeout: 1500 * time.Millisecond}
			conn, err := d.DialContext(ctx, "tcp", ip+":445")
			if err != nil {
				return
			}
			conn.Close()

			host := discoveredHost{IP: ip, Shares: []string{}}

			// Resolve hostname (1s timeout)
			lookupCtx, lookupCancel := context.WithTimeout(ctx, 1*time.Second)
			names, err := net.DefaultResolver.LookupAddr(lookupCtx, ip)
			lookupCancel()
			if err == nil && len(names) > 0 {
				host.Hostname = names[0]
			}

			// List shares (respects parent context)
			shares := listSMBShares(ctx, ip)
			if shares != nil {
				host.Shares = shares
			}

			mu.Lock()
			hosts = append(hosts, host)
			mu.Unlock()
		}(ip)
	}

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

func listSMBShares(ctx context.Context, ip string) []string {
	strategies := []struct{ user, pass string }{
		{"", ""},
		{"Guest", ""},
	}

	for _, cred := range strategies {
		select {
		case <-ctx.Done():
			return nil
		default:
		}

		d := net.Dialer{Timeout: 2 * time.Second}
		conn, err := d.DialContext(ctx, "tcp", ip+":445")
		if err != nil {
			return nil
		}

		smbDialer := &smb2.Dialer{
			Initiator: &smb2.NTLMInitiator{
				User:     cred.user,
				Password: cred.pass,
			},
		}

		s, err := smbDialer.DialContext(ctx, conn)
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
