#!/usr/bin/env bash
#
# build.sh — compile all Soroban contracts to optimized wasm.
#
# Usage: ./scripts/build.sh
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGET="wasm32v1-none"
OUT_DIR="$ROOT_DIR/target/$TARGET/release"

echo "▶ Building contracts (release, target=$TARGET)…"
cargo build --release --target "$TARGET"

echo "▶ Optimizing wasm…"
for name in stellarfund_treasury stellarfund_campaign stellarfund_factory; do
  wasm="$OUT_DIR/$name.wasm"
  if [[ -f "$wasm" ]]; then
    if command -v stellar >/dev/null 2>&1; then
      stellar contract optimize --wasm "$wasm" >/dev/null 2>&1 || true
    fi
    size=$(wc -c < "$wasm")
    echo "  ✓ $name.wasm ($size bytes)"
  else
    echo "  ✗ missing $wasm" >&2
    exit 1
  fi
done

echo "✅ Build complete. Artifacts in $OUT_DIR"
