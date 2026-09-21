#!/usr/bin/env bash
# Idempotent CodeGraph bootstrap for Cursor cloud agents (ZAC-290).
# Installs the CLI onto PATH if missing, then builds or refreshes the local index.
set -euo pipefail

export PATH="${HOME}/.local/bin:/usr/local/bin:${PATH}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v codegraph >/dev/null 2>&1; then
  echo "Installing CodeGraph CLI..."
  # /usr/local/bin is already on the cloud image PATH (unlike ~/.local/bin).
  CODEGRAPH_BIN_DIR="${CODEGRAPH_BIN_DIR:-/usr/local/bin}" \
  CODEGRAPH_INSTALL_DIR="${CODEGRAPH_INSTALL_DIR:-/usr/local/lib/codegraph}" \
    sh -c 'curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh'
  export PATH="/usr/local/bin:${HOME}/.local/bin:${PATH}"
fi

if ! command -v codegraph >/dev/null 2>&1; then
  echo "codegraph: CLI is not on PATH after install" >&2
  exit 1
fi

# --refresh is the per-boot path. `init` is a no-op after the first run;
# `sync` applies checkout diffs (feature branch on top of a Build snapshot).
if [[ "${1:-}" == "--refresh" ]]; then
  if [[ -f .codegraph/codegraph.db ]]; then
    codegraph sync
  else
    make codegraph-init
  fi
  exit 0
fi

make codegraph-init
