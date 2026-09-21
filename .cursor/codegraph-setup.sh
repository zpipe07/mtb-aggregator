#!/usr/bin/env bash
# Idempotent CodeGraph bootstrap for Cursor cloud agents (ZAC-290).
# Installs the CLI onto PATH if missing, then builds or refreshes the local index.
set -euo pipefail

export PATH="${HOME}/.local/bin:/usr/local/bin:${PATH}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

install_codegraph_cli() {
  local bin_dir install_dir
  if [[ -n "${CODEGRAPH_BIN_DIR:-}" && -n "${CODEGRAPH_INSTALL_DIR:-}" ]]; then
    bin_dir="${CODEGRAPH_BIN_DIR}"
    install_dir="${CODEGRAPH_INSTALL_DIR}"
  elif mkdir -p /usr/local/lib/codegraph /usr/local/bin 2>/dev/null \
    && [[ -w /usr/local/bin && -w /usr/local/lib/codegraph ]]; then
    # Dockerfile / root install: /usr/local/bin is already on the cloud image PATH.
    bin_dir=/usr/local/bin
    install_dir=/usr/local/lib/codegraph
  else
    # Build/install often runs as ubuntu; /usr/local is root-only.
    bin_dir="${HOME}/.local/bin"
    install_dir="${HOME}/.local/lib/codegraph"
  fi

  echo "Installing CodeGraph CLI to ${bin_dir}..."
  mkdir -p "${bin_dir}" "${install_dir}"
  CODEGRAPH_BIN_DIR="${bin_dir}" CODEGRAPH_INSTALL_DIR="${install_dir}" \
    sh -c 'curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh'
  export PATH="${bin_dir}:${HOME}/.local/bin:/usr/local/bin:${PATH}"
}

if ! command -v codegraph >/dev/null 2>&1; then
  install_codegraph_cli
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
