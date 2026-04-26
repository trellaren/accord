#!/usr/bin/env bash
# Builds the Accord desktop app for the current platform.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACCORD_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ACCORD_DIR"

if ! command -v cargo &>/dev/null; then
  echo "ERROR: Rust/Cargo is not installed. See https://rustup.rs"
  exit 1
fi

if ! cargo tauri --version &>/dev/null 2>&1; then
  echo "Installing tauri-cli …"
  cargo install tauri-cli --version "^2" --locked
fi

if [ ! -d node_modules ]; then
  echo "Installing Node dependencies …"
  npm install
fi

echo "Building Accord for release …"
cargo tauri build
