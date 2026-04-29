package version

// Version is the milmil release version. Set via -ldflags at build time
// (`-X github.com/milmil/api/internal/version.Version=$TAG`).
// Defaults to "dev" for unbuilt source / local `go run`.
var Version = "dev"
