# syntax=docker/dockerfile:1.7

# ---- Build stage -----------------------------------------------------------
# Build on the native arch — Vite output is JS/HTML/CSS, fully arch-agnostic,
# so there's no reason to run the Bun build under QEMU for arm64.
FROM --platform=$BUILDPLATFORM oven/bun:1.4-alpine AS builder
WORKDIR /app

ARG VERSION=dev
ENV VITE_APP_VERSION=${VERSION}

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run i18n:compile && bun run build

# ---- Runtime stage ---------------------------------------------------------
FROM nginx:1.29-alpine

RUN apk add --no-cache wget

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

LABEL org.opencontainers.image.title="milmil-web" \
      org.opencontainers.image.description="Self-hosted anime media server frontend" \
      org.opencontainers.image.source="https://github.com/milmil-dev/milmil" \
      org.opencontainers.image.licenses="AGPL-3.0"
