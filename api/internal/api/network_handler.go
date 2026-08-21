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
	"github.com/labstack/echo/v5"
)

type discoveredHost struct {
	IP       string   `json:"ip"`
	Hostname string   `json:"hostname"`
	Shares   []string `json:"shares"`
}

type discoverNetworkResponse struct {
	Hosts []discoveredHost `json:"hosts"`
}

func (h *handler) handleDiscoverNetwork(c *echo.Context) error {
	ctx, cancel := context.WithTimeout(c.Request().Context(), 8*time.Second)
	defer cancel()

	// Run mDNS and port scan in parallel, merge results
	var (
		mu       sync.Mutex
		hostMap  = make(map[string]*discoveredHost) // keyed by IP
		wgPhase1 sync.WaitGroup
	)

	// Phase 1a: mDNS/Bonjour discovery (fast, finds macOS/Linux hosts)
	wgPhase1.Add(1)
	go func() {
		defer wgPhase1.Done()
		for _, mh := range discoverViaMDNS(ctx) {
			mu.Lock()
			if _, exists := hostMap[mh.IP]; !exists {
				h := mh
				hostMap[mh.IP] = &h
			}
			mu.Unlock()
		}
	}()

	// Phase 1b: Port scan (finds Windows/NAS hosts that don't advertise via mDNS)
	wgPhase1.Add(1)
	go func() {
		defer wgPhase1.Done()
		for _, ph := range discoverViaPortScan(ctx) {
			mu.Lock()
			if existing, exists := hostMap[ph.IP]; exists {
				// mDNS found it too — keep the mDNS hostname (usually better)
				if existing.Hostname == "" && ph.Hostname != "" {
					existing.Hostname = ph.Hostname
				}
			} else {
				h := ph
				hostMap[ph.IP] = &h
			}
			mu.Unlock()
		}
	}()

	wgPhase1.Wait()

	// Phase 2: List SMB shares for all discovered hosts
	var wgShares sync.WaitGroup
	for _, host := range hostMap {
		wgShares.Add(1)
		go func(h *discoveredHost) {
			defer wgShares.Done()
			shares := listSMBShares(ctx, h.IP)
			if shares != nil {
				h.Shares = shares
			}
		}(host)
	}
	wgShares.Wait()

	// Collect results
	hosts := make([]discoveredHost, 0, len(hostMap))
	for _, h := range hostMap {
		if h.Shares == nil {
			h.Shares = []string{}
		}
		hosts = append(hosts, *h)
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

// discoverViaPortScan probes TCP port 445 on local subnets.
// Only discovers IPs — share listing is done by the caller.
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
	)

	// Launch all probes at once — 500ms timeout is fast enough
	for _, ip := range ips {
		if ctx.Err() != nil {
			break
		}
		wg.Add(1)
		go func(ip string) {
			defer wg.Done()

			d := net.Dialer{Timeout: 500 * time.Millisecond}
			conn, err := d.DialContext(ctx, "tcp", ip+":445")
			if err != nil {
				return
			}
			conn.Close()

			host := discoveredHost{IP: ip, Shares: []string{}}

			// Quick reverse DNS (don't block long)
			lookupCtx, lookupCancel := context.WithTimeout(ctx, 300*time.Millisecond)
			names, _ := net.DefaultResolver.LookupAddr(lookupCtx, ip)
			lookupCancel()
			if len(names) > 0 {
				host.Hostname = strings.TrimSuffix(names[0], ".")
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
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil
	}
	seen := make(map[string]bool)
	var subnets []string
	for _, iface := range ifaces {
		// Skip loopback, down, and virtual/docker interfaces
		if iface.Flags&net.FlagLoopback != 0 || iface.Flags&net.FlagUp == 0 {
			continue
		}
		name := iface.Name
		// Skip Docker, veth, bridge, VM interfaces
		if strings.HasPrefix(name, "docker") || strings.HasPrefix(name, "veth") ||
			strings.HasPrefix(name, "br-") || strings.HasPrefix(name, "virbr") ||
			strings.HasPrefix(name, "vmnet") || strings.HasPrefix(name, "vbox") {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			if ipnet, ok := addr.(*net.IPNet); ok && ipnet.IP.To4() != nil {
				ip := ipnet.IP.To4()
				// Skip link-local (169.254.x.x) and Docker ranges (172.16-31.x.x)
				if ip[0] == 169 && ip[1] == 254 {
					continue
				}
				if ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31 {
					continue
				}
				subnet := fmt.Sprintf("%d.%d.%d", ip[0], ip[1], ip[2])
				if !seen[subnet] {
					seen[subnet] = true
					subnets = append(subnets, subnet)
				}
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
