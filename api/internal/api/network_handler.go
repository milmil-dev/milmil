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
	ctx, cancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
	defer cancel()

	// Get local subnet from server's network interfaces
	subnet, err := getLocalSubnet()
	if err != nil {
		return c.JSON(http.StatusOK, discoverNetworkResponse{Hosts: []discoveredHost{}})
	}

	// Scan port 445 on /24 subnet concurrently
	var (
		mu    sync.Mutex
		hosts []discoveredHost
		wg    sync.WaitGroup
		sem   = make(chan struct{}, 32) // max 32 concurrent goroutines
	)

	for i := 1; i < 255; i++ {
		select {
		case <-ctx.Done():
			goto done
		default:
		}

		ip := fmt.Sprintf("%s.%d", subnet, i)
		wg.Add(1)
		sem <- struct{}{}

		go func(ip string) {
			defer wg.Done()
			defer func() { <-sem }()

			conn, err := net.DialTimeout("tcp", ip+":445", 1*time.Second)
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

			// Try to list SMB shares (anonymous/guest)
			shares := listSMBShares(ip)
			host.Shares = shares

			mu.Lock()
			hosts = append(hosts, host)
			mu.Unlock()
		}(ip)
	}

done:
	wg.Wait()

	if hosts == nil {
		hosts = []discoveredHost{}
	}
	return c.JSON(http.StatusOK, discoverNetworkResponse{Hosts: hosts})
}

func getLocalSubnet() (string, error) {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "", err
	}
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() && ipnet.IP.To4() != nil {
			ip := ipnet.IP.To4()
			return fmt.Sprintf("%d.%d.%d", ip[0], ip[1], ip[2]), nil
		}
	}
	return "", fmt.Errorf("no suitable interface found")
}

func listSMBShares(ip string) []string {
	conn, err := net.DialTimeout("tcp", ip+":445", 2*time.Second)
	if err != nil {
		return nil
	}
	defer conn.Close()

	d := &smb2.Dialer{
		Initiator: &smb2.NTLMInitiator{
			User:     "Guest",
			Password: "",
		},
	}

	s, err := d.DialContext(context.Background(), conn)
	if err != nil {
		return nil
	}
	defer s.Logoff()

	names, err := s.ListSharenames()
	if err != nil {
		return nil
	}

	// Filter out admin shares (ending with $)
	var shares []string
	for _, name := range names {
		if len(name) > 0 && name[len(name)-1] != '$' {
			shares = append(shares, name)
		}
	}
	return shares
}
