#!/usr/bin/env bash
# Ensures the Playwright npm package version matches the scraper Docker base image.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PKG="$ROOT/apps/scraper/package.json"
DOCKERFILE="$ROOT/apps/scraper/Dockerfile"

PKG_VERSION="$(node -p "require('$PKG').dependencies.playwright.replace(/^\\^/, '')")"
DOCKER_TAG="$(grep -oE 'playwright:v[0-9]+\.[0-9]+\.[0-9]+' "$DOCKERFILE" | head -1)"
DOCKER_VERSION="${DOCKER_TAG#playwright:v}"

if [[ -z "$DOCKER_VERSION" ]]; then
  echo "Could not parse Playwright version from $DOCKERFILE"
  exit 1
fi

if [[ "$PKG_VERSION" != "$DOCKER_VERSION" ]]; then
  echo "Playwright version mismatch between npm and Docker image:"
  echo "  package.json: $PKG_VERSION"
  echo "  Dockerfile:   $DOCKER_VERSION"
  echo "Update apps/scraper/Dockerfile:"
  echo "  FROM mcr.microsoft.com/playwright:v${PKG_VERSION}-jammy"
  exit 1
fi

echo "Playwright Docker image version matches package.json ($PKG_VERSION)"
