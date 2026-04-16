export PATH := $(HOME)/go/bin:$(PATH)

.PHONY: dev dev-api dev-web dev-docs build build-docs test test-e2e lint setup

# Prerequisites: go install github.com/air-verse/air@latest

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

dev-docs:
	cd docs-site && bun dev

build:
	cd web && bun run i18n:compile && bun run build

build-docs:
	cd docs-site && bun run build

test:
	@echo "--- Go unit tests ---"
	cd api && go test ./...
	@echo "--- Go integration tests ---"
	cd api && go test -tags=integration ./...
	@echo "--- Frontend tests ---"
	cd web && bun run test:run

test-e2e:
	@echo "--- Playwright E2E tests ---"
	cd web && bun run test:e2e

lint:
	cd api && go vet ./...
	cd web && bun run lint

setup:
	mise install
	go install github.com/air-verse/air@latest
