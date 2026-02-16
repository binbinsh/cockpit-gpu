#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  cat <<'USAGE'
Usage:
  ./deploy-gpu-plugin.sh <ssh-host> [remote-dir]

Examples:
  ./deploy-gpu-plugin.sh gpu
  ./deploy-gpu-plugin.sh user@10.0.0.12 ~/.local/share/cockpit/gpus

Environment variables:
  REBUILD_DIST=1|0   Build before deploy (default: 1)
  BUILD_DIR=...      Dist directory (default: vendors/cockpit/dist/cockpit-gpu)
USAGE
  exit 1
fi

TARGET_HOST="$1"
REMOTE_DIR="${2:-~/.local/share/cockpit/gpus}"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

ROOT_PLUGIN_DIR="$PROJECT_DIR/plugin"
VENDOR_DIR="$PROJECT_DIR/vendors/cockpit"
VENDOR_PLUGIN_DIR="$VENDOR_DIR/pkg/cockpit-gpu"
BUILD_DIR="${BUILD_DIR:-$VENDOR_DIR/dist/cockpit-gpu}"
REBUILD_DIST="${REBUILD_DIST:-1}"

if [[ "$REMOTE_DIR" == "~/"* ]]; then
  REMOTE_HOME="$(ssh "$TARGET_HOST" 'printf %s "$HOME"')"
  REMOTE_DIR="${REMOTE_HOME%/}/${REMOTE_DIR#~/}"
fi

sync_plugin_source() {
  if [[ -d "$ROOT_PLUGIN_DIR" && -d "$VENDOR_DIR/pkg" ]]; then
    mkdir -p "$VENDOR_PLUGIN_DIR"
    rsync -a --delete "$ROOT_PLUGIN_DIR/" "$VENDOR_PLUGIN_DIR/"
  fi
}

if [[ "$REBUILD_DIST" == "1" ]]; then
  if [[ -x "$VENDOR_DIR/build.js" ]]; then
    echo "Building cockpit-gpu ..."
    sync_plugin_source
    (cd "$VENDOR_DIR" && NODE_ENV=production ./build.js cockpit-gpu)
  else
    echo "Skip build: $VENDOR_DIR/build.js not found"
  fi
fi

for required in cockpit-gpu.js cockpit-gpu.css cockpit-gpu-boot.js index.html manifest.json; do
  if [[ ! -f "$BUILD_DIR/$required" ]]; then
    echo "ERROR: missing file: $BUILD_DIR/$required"
    exit 2
  fi
done

echo "Deploying to $TARGET_HOST:$REMOTE_DIR"
ssh "$TARGET_HOST" "mkdir -p '$REMOTE_DIR'"
rsync -az --delete "$BUILD_DIR/" "$TARGET_HOST:$REMOTE_DIR/"

ssh "$TARGET_HOST" 'rm -rf ~/.local/share/cockpit/gpu-monitor ~/.local/share/cockpit/cockpit-gpu 2>/dev/null || true'

ssh "$TARGET_HOST" '
if command -v systemctl >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
    sudo systemctl restart cockpit.socket 2>/dev/null || sudo systemctl restart cockpit.service 2>/dev/null || true
  else
    systemctl --user restart cockpit.socket 2>/dev/null || systemctl --user restart cockpit.service 2>/dev/null || true
  fi
fi
' || true

REMOTE_VERSION="$(ssh "$TARGET_HOST" "python3 - <<'PY'
import json
from pathlib import Path
p = Path('$REMOTE_DIR') / 'manifest.json'
try:
    print(json.loads(p.read_text(encoding='utf-8')).get('version', ''))
except Exception:
    print('')
PY
")"

echo "Done. manifest version: ${REMOTE_VERSION:-unknown}"
echo "Open: /cockpit/@localhost/gpus/"
