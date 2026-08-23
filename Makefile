export PATH := $(HOME)/go/bin:$(PATH)

.PHONY: dev dev-api dev-web dev-docs build build-docs test test-e2e lint setup kill \
	macos-gen macos-build macos-test macos-lint macos-run macos-watch

# Prerequisites: go install github.com/air-verse/air@latest

# Start both API (air) and web (vite) dev servers
dev:
	@trap 'kill 0; wait' INT TERM EXIT; \
	cd api && air & \
	cd web && bun dev & \
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

kill:
	@./scripts/release-ports.sh

setup:
	mise install
	go install github.com/air-verse/air@latest

# --- macOS client (macos/) ---------------------------------------------------
# Requires Xcode 26+; xcodegen and swiftlint come from `mise install`.

macos-gen:
	cd macos && xcodegen generate --quiet

macos-test:
	swift test --package-path macos/Packages/MilmilKit
	swift test --package-path macos/Packages/MilmilPlayer

macos-lint:
	cd macos && swiftlint lint --strict --quiet

macos-build: macos-gen
	cd macos && xcodebuild -project Milmil.xcodeproj -scheme Milmil \
		-destination 'platform=macOS,arch=arm64' -configuration Debug \
		CODE_SIGNING_ALLOWED=NO -quiet build

# Build into macos/DerivedData (gitignored) and launch the app — no Xcode UI needed.
macos-run: macos-gen
	cd macos && xcodebuild -project Milmil.xcodeproj -scheme Milmil \
		-destination 'platform=macOS,arch=arm64' -configuration Debug \
		-derivedDataPath DerivedData -quiet build \
		&& (pkill -x milmil || true) \
		&& open DerivedData/Build/Products/Debug/milmil.app

# Dev-server-style loop: rebuild + relaunch whenever a Swift/yml file changes.
# Incremental builds take a few seconds; use Xcode Previews for pure UI tweaks.
macos-watch:
	watchexec --project-origin . -w macos -e swift,yml,xcstrings -r --debounce 500ms -- $(MAKE) macos-run
