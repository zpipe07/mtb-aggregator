#!/usr/bin/env bash
# CI guard: keep Docker base images and CI tool versions aligned with repo pins.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAILURES=0

report_mismatch() {
  local name="$1"
  echo "ERROR: ${name} version mismatch:"
  while IFS= read -r line; do
    [[ -n "$line" ]] && echo "  $line"
  done <<< "$2"
  FAILURES=$((FAILURES + 1))
}

check_playwright_docker() {
  local pkg="$ROOT/apps/scraper/package.json"
  local dockerfile="$ROOT/apps/scraper/Dockerfile"
  local pkg_version docker_tag docker_version

  pkg_version="$(node -p "require('$pkg').dependencies.playwright.replace(/^\\^/, '')")"
  docker_tag="$(grep -oE 'playwright:v[0-9]+\.[0-9]+\.[0-9]+' "$dockerfile" | head -1)"
  docker_version="${docker_tag#playwright:v}"

  if [[ -z "$docker_version" ]]; then
    report_mismatch "Playwright Docker image" "Could not parse version from $dockerfile"
    return
  fi

  if [[ "$pkg_version" != "$docker_version" ]]; then
    report_mismatch "Playwright (npm vs scraper Docker image)" \
      "package.json: $pkg_version\nDockerfile:   $docker_version\nFix: FROM mcr.microsoft.com/playwright:v${pkg_version}-jammy"
    return
  fi

  echo "OK Playwright npm ($pkg_version) matches scraper Docker image"
}

check_go_toolchain_docker() {
  local gomod="$ROOT/apps/api/go.mod"
  local dockerfile="$ROOT/apps/api/Dockerfile"
  local toolchain docker_version

  toolchain="$(grep -E '^toolchain ' "$gomod" | awk '{print $2}' | sed 's/^go//')"
  docker_version="$(grep -oE 'golang:[0-9]+\.[0-9]+\.[0-9]+' "$dockerfile" | head -1 | sed 's/golang://')"

  if [[ -z "$toolchain" || -z "$docker_version" ]]; then
    report_mismatch "Go toolchain (go.mod vs API Docker image)" \
      "Could not parse toolchain from $gomod or golang tag from $dockerfile"
    return
  fi

  if [[ "$toolchain" != "$docker_version" ]]; then
    report_mismatch "Go toolchain (go.mod vs API Docker image)" \
      "go.mod toolchain: $toolchain\nDockerfile:       $docker_version\nFix: FROM golang:${toolchain}-alpine"
    return
  fi

  echo "OK Go toolchain ($toolchain) matches API Docker builder image"
}

check_go_toolchain_ci() {
  local gomod="$ROOT/apps/api/go.mod"
  local ci="$ROOT/.github/workflows/ci.yml"
  local toolchain ci_versions ci_version ci_count

  toolchain="$(grep -E '^toolchain ' "$gomod" | awk '{print $2}' | sed 's/^go//')"
  ci_versions="$(grep -E 'go-version:' "$ci" | sed -E 's/.*"([^"]+)".*/\1/' | sort -u)"
  ci_count="$(printf '%s\n' "$ci_versions" | grep -c . || true)"
  ci_version="$(printf '%s\n' "$ci_versions" | head -1)"

  if [[ -z "$toolchain" || -z "$ci_version" ]]; then
    report_mismatch "Go toolchain (go.mod vs CI)" \
      "Could not parse toolchain from $gomod or go-version from $ci"
    return
  fi

  if [[ "$ci_count" -gt 1 ]]; then
    report_mismatch "Go toolchain (CI go-version pins)" \
      "Multiple distinct go-version values in $ci:\n${ci_versions}\nFix: keep a single go-version matching go.mod toolchain"
    return
  fi

  if [[ "$toolchain" != "$ci_version" ]]; then
    report_mismatch "Go toolchain (go.mod vs CI)" \
      "go.mod toolchain: $toolchain\nCI go-version:    $ci_version\nFix: go-version in .github/workflows/ci.yml"
    return
  fi

  echo "OK Go toolchain ($toolchain) matches CI go-version"
}

check_pnpm_docker() {
  local pkg="$ROOT/package.json"
  local dockerfile="$ROOT/apps/scraper/Dockerfile"
  local pinned docker_pnpm

  pinned="$(node -p "require('$pkg').packageManager.replace(/^pnpm@/, '')")"
  docker_pnpm="$(grep -oE 'pnpm@[0-9]+\.[0-9]+\.[0-9]+' "$dockerfile" | head -1 | sed 's/pnpm@//')"

  if [[ -z "$pinned" ]]; then
    report_mismatch "pnpm (package.json vs scraper Docker image)" \
      "No packageManager field in root package.json"
    return
  fi

  if [[ -z "$docker_pnpm" ]]; then
    report_mismatch "pnpm (package.json vs scraper Docker image)" \
      "Could not find corepack prepare pnpm@X.Y.Z in $dockerfile"
    return
  fi

  if [[ "$pinned" != "$docker_pnpm" ]]; then
    report_mismatch "pnpm (package.json vs scraper Docker image)" \
      "package.json packageManager: $pinned\nDockerfile corepack:        $docker_pnpm\nFix: corepack prepare pnpm@${pinned} --activate"
    return
  fi

  echo "OK pnpm ($pinned) matches scraper Docker corepack pin"
}

check_lockfile_no_ssh_git_deps() {
  local lockfile="$ROOT/pnpm-lock.yaml"

  if grep -q 'git@github.com' "$lockfile"; then
    report_mismatch "pnpm-lock.yaml git SSH dependencies" \
      "Found git@github.com in $lockfile.\nDependabot lockfile refreshes can rewrite github: overrides to SSH git URLs that fail in CI.\nFix: use https://codeload.github.com/.../tar.gz/<commit> in package.json pnpm.overrides and re-run pnpm install."
    return
  fi

  echo "OK pnpm-lock.yaml has no git@github.com SSH dependency URLs"
}

check_playwright_docker
check_go_toolchain_docker
check_go_toolchain_ci
check_pnpm_docker
check_lockfile_no_ssh_git_deps

if [[ "$FAILURES" -gt 0 ]]; then
  echo ""
  echo "$FAILURES version sync check(s) failed."
  exit 1
fi

echo "All build version sync checks passed."
