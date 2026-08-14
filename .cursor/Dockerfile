# Cloud agent base image. Do not COPY the repo — Cursor checks out the workspace.
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    GO_VERSION=1.26.6 \
    NODE_MAJOR=20 \
    PNPM_VERSION=9.14.2

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    build-essential \
    python3 \
  && curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && corepack enable \
  && corepack prepare "pnpm@${PNPM_VERSION}" --activate \
  && ARCH="$(dpkg --print-architecture)" \
  && curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${ARCH}.tar.gz" | tar -C /usr/local -xz \
  && rm -rf /var/lib/apt/lists/*

ENV PATH="/usr/local/go/bin:${PATH}" \
    GOPATH="/root/go" \
    GOTOOLCHAIN=local
