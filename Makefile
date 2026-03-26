.PHONY: dev dev-api dev-web build test lint

# Start both API (air) and web (vite) dev servers
dev:
	@trap 'kill 0' SIGINT; \
	(cd api && air) & \
	(cd web && bun dev) & \
	wait

dev-api:
	cd api && air

dev-web:
	cd web && bun dev

build:
	cd web && bun run i18n:compile && bun run build

test:
	@echo "--- Go unit tests ---"
	cd api && go test ./...
	@echo "--- Go integration tests ---"
	cd api && go test -tags=integration ./...
	@echo "--- Frontend tests ---"
	cd web && bun run test:run

lint:
	cd api && go vet ./...
	cd web && bun run lint
