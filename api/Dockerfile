# syntax=docker/dockerfile:1.7

# ---- Build stage -----------------------------------------------------------
# Build on the native arch and let Go cross-compile to the target arch — avoids
# QEMU emulation, which turns a multi-arch publish from ~3min into ~30min.
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS builder

ARG TARGETOS
ARG TARGETARCH
ARG TARGETVARIANT
ARG VERSION=dev

WORKDIR /src

# Cache go modules layer separately for faster rebuilds
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .

# -trimpath: reproducible binary (no local paths)
# -s -w:    strip debug info and symbol table (smaller binary)
# -X version.Version=...: stamp the release version into the binary
# GOARM:    set the ARM variant when targeting linux/arm/v6 or v7 (no-op otherwise)
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 \
      GOOS=${TARGETOS} \
      GOARCH=${TARGETARCH} \
      GOARM=${TARGETVARIANT#v} \
    go build \
      -trimpath \
      -ldflags "-s -w -X github.com/milmil/api/internal/version.Version=${VERSION}" \
      -o /out/milmil-api \
      ./cmd/server

# ---- Runtime stage ---------------------------------------------------------
FROM alpine:3.23

RUN apk add --no-cache \
      ffmpeg \
      ca-certificates \
      tzdata \
      wget \
 && addgroup -S milmil \
 && adduser -S -G milmil -H -D milmil \
 && mkdir -p /app/data \
 && chown -R milmil:milmil /app

WORKDIR /app
COPY --from=builder --chown=milmil:milmil /out/milmil-api /app/milmil-api

USER milmil

EXPOSE 8080
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

LABEL org.opencontainers.image.title="milmil-api" \
      org.opencontainers.image.description="Self-hosted anime media server API" \
      org.opencontainers.image.source="https://github.com/milmil-dev/milmil" \
      org.opencontainers.image.licenses="AGPL-3.0"

ENTRYPOINT ["/app/milmil-api"]
