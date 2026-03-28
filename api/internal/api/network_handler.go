package api

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/grandcat/zeroconf"
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
	ctx, cancel := context.WithTimeout(c.Request().Context(), 6*time.Second)
	defer cancel()

	// Phase 1: mDNS/Bonjour discovery (fast, ~2 seconds)
	mdnsHosts := discoverViaMDNS(ctx)

	// Phase 2: For hosts found, try to list their SMB shares
	var (
		mu    sync.Mutex
		hosts []discoveredHost
		wg    sync.WaitGroup
	)

	for _, mh := range mdnsHosts {
		wg.Add(1)
		go func(mh discoveredHost) {
			defer wg.Done()
			shares := listSMBShares(ctx, mh.IP)
			mh.Shares = shares
			if mh.Shares == nil {
				mh.Shares = []string{}
			}
			mu.Lock()
			hosts = append(hosts, mh)
			mu.Unlock()
		}(mh)
	}

	wg.Wait()

	// Phase 3: If mDNS found nothing, fall back to port scan on local subnet
	if len(hosts) == 0 {
		hosts = discoverViaPortScan(ctx)
	}

	if hosts == nil {
		hosts = []discoveredHost{}
	}
	return c.JSON(http.StatusOK, discoverNetworkResponse{Hosts: hosts})
}

// discoverViaMDNS browses for SMB services using mDNS/Bonjour (_smb._tcp)
func discoverViaMDNS(ctx context.Context) []discoveredHost {
	// Browse for 3 seconds max
	browseCtx, browseCancel := context.WithTimeout(ctx, 3*time.Second)
	defer browseCancel()

	resolver, err := zeroconf.NewResolver(nil)
	if err != nil {
		return nil
	}

	entries := make(chan *zeroconf.ServiceEntry, 32)
	var hosts []discoveredHost
	seen := make(map[string]bool)

	go func() {
		for entry := range entries {
			// Get the best IP (prefer IPv4)
			var ip string
			for _, addr := range entry.AddrIPv4 {
				ip = addr.String()
				break
			}
			if ip == "" {
				for _, addr := range entry.AddrIPv6 {
					ip = addr.String()
					break
				}
			}
			if ip == "" || seen[ip] {
				continue
			}
			seen[ip] = true

			hostname := strings.TrimSuffix(entry.HostName, ".")
			if hostname == "" {
				hostname = entry.Instance
			}

			hosts = append(hosts, discoveredHost{
				IP:       ip,
				Hostname: hostname,
				Shares:   []string{},
			})
		}
	}()

	// Browse _smb._tcp services
	if err := resolver.Browse(browseCtx, "_smb._tcp", "local.", entries); err != nil {
		return hosts
	}

	<-browseCtx.Done()
	return hosts
}

// discoverViaPortScan falls back to TCP port 445 scanning on local subnets
func discoverViaPortScan(ctx context.Context) []discoveredHost {
	subnets := getLocalSubnets()
	if len(subnets) == 0 {
		return nil
	}

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

	var (
		mu    sync.Mutex
		hosts []discoveredHost
		wg    sync.WaitGroup
		sem   = make(chan struct{}, 64)
	)

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

			d := net.Dialer{Timeout: 1 * time.Second}
			conn, err := d.DialContext(ctx, "tcp", ip+":445")
			if err != nil {
				return
			}
			conn.Close()

			host := discoveredHost{IP: ip, Shares: []string{}}

			lookupCtx, lookupCancel := context.WithTimeout(ctx, 500*time.Millisecond)
			names, _ := net.DefaultResolver.LookupAddr(lookupCtx, ip)
			lookupCancel()
			if len(names) > 0 {
				host.Hostname = strings.TrimSuffix(names[0], ".")
			}

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
	return hosts
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
