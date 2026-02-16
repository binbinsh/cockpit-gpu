#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME="$(basename "${0}")"
DEFAULT_REPO_SLUG="binbinsh/cockpit-gpu"
DEFAULT_REF="main"
DEFAULT_PLUGIN_NAME="gpus"
DEFAULT_COCKPIT_REPO_SLUG="cockpit-project/cockpit"
DEFAULT_COCKPIT_REF="main"

REPO_SLUG="${REPO_SLUG:-$DEFAULT_REPO_SLUG}"
REF="${REF:-$DEFAULT_REF}"
PLUGIN_NAME="${PLUGIN_NAME:-$DEFAULT_PLUGIN_NAME}"
COCKPIT_REPO="${COCKPIT_REPO:-$DEFAULT_COCKPIT_REPO_SLUG}"
COCKPIT_REF="${COCKPIT_REF:-$DEFAULT_COCKPIT_REF}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/share/cockpit/$PLUGIN_NAME}"
FROM_LOCAL=""
KEEP_WORKDIR=0
PLUGIN_VERSION_INPUT="${PLUGIN_VERSION:-}"
BUILT_DIST_DIR=""

usage() {
  cat <<'USAGE'
Usage:
  install.sh [options]

Options:
  --repo <owner/repo>     GitHub repository slug (default: binbinsh/cockpit-gpu)
  --ref <branch|tag|sha>  Git reference to install (default: main)
  --cockpit-repo <slug>   Cockpit source repo for build fallback (default: cockpit-project/cockpit)
  --cockpit-ref <ref>     Cockpit git ref for build fallback (default: main)
  --dir <path>            Install path (default: ~/.local/share/cockpit/gpus)
  --from-local <path>     Install from local repository path (skip download)
  --plugin-name <name>    Cockpit manifest name/path (default: gpus)
  --keep-workdir          Keep temporary working directory for debugging
  -h, --help              Show this help

Environment variables (optional):
  REPO_SLUG, REF, COCKPIT_REPO, COCKPIT_REF, INSTALL_DIR, PLUGIN_NAME, PLUGIN_VERSION

Examples:
  curl -fsSL https://raw.githubusercontent.com/binbinsh/cockpit-gpu/main/install.sh | bash
  curl -fsSL https://raw.githubusercontent.com/binbinsh/cockpit-gpu/main/install.sh | bash -s -- --ref v1.0.0
  ./install.sh --from-local /path/to/cockpit-gpu
USAGE
}

normalize_plugin_version() {
  local input="$1"
  local version="${input#V}"
  version="${version#v}"
  version="${version#.}"

  if [[ "$version" =~ ^[0-9]{2}\.[0-9]{4}\.[0-9]{4}$ ]]; then
    echo "$version"
    return 0
  fi

  if [[ -n "$input" ]]; then
    echo "WARN: invalid PLUGIN_VERSION '$input', fallback to current time" >&2
  fi
  date +%y.%m%d.%H%M
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO_SLUG="$2"
      shift 2
      ;;
    --ref)
      REF="$2"
      shift 2
      ;;
    --cockpit-repo)
      COCKPIT_REPO="$2"
      shift 2
      ;;
    --cockpit-ref)
      COCKPIT_REF="$2"
      shift 2
      ;;
    --dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --from-local)
      FROM_LOCAL="$2"
      shift 2
      ;;
    --plugin-name)
      PLUGIN_NAME="$2"
      shift 2
      ;;
    --keep-workdir)
      KEEP_WORKDIR=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

PLUGIN_VERSION="$(normalize_plugin_version "$PLUGIN_VERSION_INPUT")"
WORKDIR="$(mktemp -d)"

cleanup() {
  if [[ "$KEEP_WORKDIR" -eq 0 ]]; then
    rm -rf "$WORKDIR"
  else
    echo "INFO: keeping workdir: $WORKDIR"
  fi
}
trap cleanup EXIT

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: required command not found: $1" >&2
    exit 3
  fi
}

is_installable_dist_dir() {
  local d="$1"
  [[ -f "$d/manifest.json" ]] || return 1
  ([[ -f "$d/cockpit-gpu.js" ]] || [[ -f "$d/cockpit-gpu.js.gz" ]]) || return 1
  ([[ -f "$d/cockpit-gpu.css" ]] || [[ -f "$d/cockpit-gpu.css.gz" ]]) || return 1
  return 0
}

ensure_plain_file_from_gz() {
  local gz_file="$1"
  local plain_file="$2"

  [[ -f "$plain_file" ]] && return 0
  [[ -f "$gz_file" ]] || return 1
  require_cmd gzip
  gzip -dc "$gz_file" > "$plain_file"
}

copy_if_missing() {
  local dst="$1"
  local src="$2"
  if [[ ! -f "$dst" && -f "$src" ]]; then
    cp "$src" "$dst"
  fi
}

apply_version_to_index() {
  local index_file="$1"
  [[ -f "$index_file" ]] || return 0

  perl -pi -e "s#(href[[:space:]]*=[[:space:]]*['\\\"])([^'\\\"[:space:]>]*cockpit-gpu\\.css)(?:\\?[^'\\\"[:space:]>]*)?(['\\\"])#\\1cockpit-gpu.css?v=${PLUGIN_VERSION}\\3#g" "$index_file"
  perl -pi -e "s#(src[[:space:]]*=[[:space:]]*['\\\"])([^'\\\"[:space:]>]*cockpit-gpu-boot\\.js)(?:\\?[^'\\\"[:space:]>]*)?(['\\\"])#\\1cockpit-gpu-boot.js?v=${PLUGIN_VERSION}\\3#g" "$index_file"
}

apply_version_to_js() {
  local js_file="$1"
  [[ -f "$js_file" ]] || return 0
  perl -pi -e "s/(APP_VERSION\\s*=\\s*['\\\"])[0-9]{2}\\.[0-9]{4}\\.[0-9]{4}(['\\\"])/\${1}${PLUGIN_VERSION}\${2}/g" "$js_file"
  if ! grep -q "${PLUGIN_VERSION}" "$js_file"; then
    perl -pi -e "s/[0-9]{2}\\.[0-9]{4}\\.[0-9]{4}/${PLUGIN_VERSION}/g" "$js_file"
  fi
}

apply_version_to_boot() {
  local boot_file="$1"
  [[ -f "$boot_file" ]] || return 0
  perl -pi -e "s/(const\\s+version\\s*=\\s*['\\\"])[0-9]{2}\\.[0-9]{4}\\.[0-9]{4}(['\\\"])/\${1}${PLUGIN_VERSION}\${2}/g" "$boot_file"
  if ! grep -q "${PLUGIN_VERSION}" "$boot_file"; then
    perl -pi -e "s/[0-9]{2}\\.[0-9]{4}\\.[0-9]{4}/${PLUGIN_VERSION}/g" "$boot_file"
  fi
}

patch_manifest() {
  local manifest_file="$1"
  [[ -f "$manifest_file" ]] || return 0
  require_cmd python3
  python3 - "$manifest_file" "$PLUGIN_NAME" "$PLUGIN_VERSION" <<'PY'
import json
import sys
path, plugin_name, plugin_version = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)
data["name"] = plugin_name
data["version"] = plugin_version
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=4)
    f.write("\n")
PY
}

generate_gzip_assets() {
  if ! command -v gzip >/dev/null 2>&1; then
    echo "WARN: gzip not found, skip generating .gz assets"
    return 0
  fi

  local f
  for f in cockpit-gpu.js cockpit-gpu.css cockpit-gpu-boot.js; do
    if [[ -f "$STAGE_DIR/$f" ]]; then
      gzip -c "$STAGE_DIR/$f" > "$STAGE_DIR/$f.gz"
    fi
  done
}

build_dist_from_plugin_source() {
  local root="$1"
  local plugin_dir="$root/plugin"
  local cockpit_root=""
  local candidate=""

  [[ -d "$plugin_dir" ]] || return 1
  require_cmd node
  require_cmd npm
  require_cmd rsync

  if [[ -x "$root/vendors/cockpit/build.js" ]]; then
    cockpit_root="$root/vendors/cockpit"
  else
    require_cmd curl
    require_cmd tar
    local cockpit_work="$WORKDIR/cockpit-builder"
    local cockpit_archive="$cockpit_work/cockpit.tar.gz"
    local cockpit_url="https://codeload.github.com/${COCKPIT_REPO}/tar.gz/${COCKPIT_REF}"

    mkdir -p "$cockpit_work"
    echo "INFO: downloading Cockpit build environment: $cockpit_url" >&2
    curl -fL "$cockpit_url" -o "$cockpit_archive"
    tar -xzf "$cockpit_archive" -C "$cockpit_work"
    cockpit_root="$(find "$cockpit_work" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  fi

  if [[ -z "$cockpit_root" || ! -d "$cockpit_root" || ! -d "$cockpit_root/pkg" ]]; then
    echo "ERROR: invalid Cockpit build root: $cockpit_root" >&2
    return 1
  fi

  mkdir -p "$cockpit_root/pkg/cockpit-gpu"
  echo "INFO: syncing plugin source into Cockpit build tree" >&2
  rsync -a --delete "$plugin_dir/" "$cockpit_root/pkg/cockpit-gpu/"
  patch_cockpit_files_js "$cockpit_root"

  if [[ -x "$cockpit_root/tools/node-modules" && -n "$(command -v podman || true)" ]]; then
    echo "INFO: installing Cockpit node modules (podman path)" >&2
    if ! (cd "$cockpit_root" && ./tools/node-modules install) >&2; then
      echo "WARN: tools/node-modules install failed, fallback to npm install" >&2
      (cd "$cockpit_root" && npm install) >&2
    fi
  else
    echo "INFO: installing npm dependencies" >&2
    (cd "$cockpit_root" && npm install) >&2
  fi

  echo "INFO: building cockpit-gpu dist" >&2
  if ! (cd "$cockpit_root" && NODE_ENV=production ./build.js cockpit-gpu) >&2; then
    echo "WARN: build.js returned non-zero, checking dist artifacts anyway" >&2
  fi

  candidate="$cockpit_root/dist/cockpit-gpu"
  if is_installable_dist_dir "$candidate"; then
    BUILT_DIST_DIR="$candidate"
    return 0
  fi

  echo "ERROR: build finished but dist output not found at $candidate" >&2
  return 1
}

patch_cockpit_files_js() {
  local cockpit_root="$1"
  local files_js="$cockpit_root/files.js"
  [[ -f "$files_js" ]] || return 0

  require_cmd python3
  python3 - "$files_js" <<'PY'
import re
import sys
from pathlib import Path

p = Path(sys.argv[1])
text = p.read_text(encoding="utf-8")
original = text

def add_to_array(src: str, key: str, value: str) -> str:
    pattern = rf"({key}\s*:\s*\[)([\s\S]*?)(\n\s*\],)"
    m = re.search(pattern, src)
    if not m:
        return src
    head, body, tail = m.group(1), m.group(2), m.group(3)
    if value in body:
        return src
    body = body.rstrip() + f"\n        {value},"
    return src[:m.start()] + head + body + tail + src[m.end():]

text = add_to_array(text, "entries", '"cockpit-gpu/cockpit-gpu.jsx"')
text = add_to_array(text, "files", '"cockpit-gpu/index.html"')

if text != original:
    p.write_text(text, encoding="utf-8")
PY
}

find_source_dir() {
  local root="$1"
  local candidate

  for candidate in \
    "$root/dist_manual/cockpit-gpu" \
    "$root/dist/cockpit-gpu" \
    "$root/plugin-dist/cockpit-gpu" \
    "$root/vendors/cockpit/dist_manual/cockpit-gpu" \
    "$root/vendors/cockpit/dist/cockpit-gpu"; do
    if is_installable_dist_dir "$candidate"; then
      echo "$candidate"
      return 0
    fi
  done

  BUILT_DIST_DIR=""
  if build_dist_from_plugin_source "$root" && [[ -n "$BUILT_DIST_DIR" ]] && [[ -f "$BUILT_DIST_DIR/manifest.json" ]]; then
    echo "$BUILT_DIST_DIR"
    return 0
  fi

  return 1
}

if [[ -n "$FROM_LOCAL" ]]; then
  REPO_DIR="$(cd "$FROM_LOCAL" && pwd)"
else
  require_cmd curl
  require_cmd tar
  ARCHIVE_URL="https://codeload.github.com/${REPO_SLUG}/tar.gz/${REF}"
  ARCHIVE_FILE="$WORKDIR/repo.tar.gz"
  echo "INFO: downloading $ARCHIVE_URL"
  curl -fL "$ARCHIVE_URL" -o "$ARCHIVE_FILE"
  tar -xzf "$ARCHIVE_FILE" -C "$WORKDIR"
  REPO_DIR="$(find "$WORKDIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
fi

if [[ -z "${REPO_DIR:-}" || ! -d "$REPO_DIR" ]]; then
  echo "ERROR: failed to locate repository content" >&2
  exit 4
fi

SOURCE_DIR="$(find_source_dir "$REPO_DIR" || true)"
if [[ -z "$SOURCE_DIR" ]]; then
  echo "ERROR: no installable cockpit-gpu dist found under repository" >&2
  exit 5
fi

STAGE_DIR="$WORKDIR/stage"
mkdir -p "$STAGE_DIR"
cp -a "$SOURCE_DIR/." "$STAGE_DIR/"
copy_if_missing "$STAGE_DIR/index.html" "$REPO_DIR/plugin/index.html"
copy_if_missing "$STAGE_DIR/cockpit-gpu-boot.js" "$REPO_DIR/plugin/cockpit-gpu-boot.js"
copy_if_missing "$STAGE_DIR/po.js" "$REPO_DIR/plugin/po.js"
ensure_plain_file_from_gz "$STAGE_DIR/cockpit-gpu.js.gz" "$STAGE_DIR/cockpit-gpu.js" || true
ensure_plain_file_from_gz "$STAGE_DIR/cockpit-gpu.css.gz" "$STAGE_DIR/cockpit-gpu.css" || true
ensure_plain_file_from_gz "$STAGE_DIR/cockpit-gpu-boot.js.gz" "$STAGE_DIR/cockpit-gpu-boot.js" || true

for required in manifest.json index.html cockpit-gpu.js cockpit-gpu.css cockpit-gpu-boot.js; do
  if [[ ! -f "$STAGE_DIR/$required" ]]; then
    echo "ERROR: missing required staged file: $required" >&2
    exit 6
  fi
done

patch_manifest "$STAGE_DIR/manifest.json"
apply_version_to_index "$STAGE_DIR/index.html"
apply_version_to_js "$STAGE_DIR/cockpit-gpu.js"
apply_version_to_boot "$STAGE_DIR/cockpit-gpu-boot.js"
generate_gzip_assets

mkdir -p "$INSTALL_DIR"
if command -v rsync >/dev/null 2>&1; then
  rsync -av --delete "$STAGE_DIR/" "$INSTALL_DIR/"
else
  rm -rf "$INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"
  cp -a "$STAGE_DIR/." "$INSTALL_DIR/"
fi

if [[ "$INSTALL_DIR" == *"/.local/share/cockpit/"* ]]; then
  rm -rf "$HOME/.local/share/cockpit/gpu-monitor" \
         "$HOME/.local/share/cockpit/cockpit-gpu" \
         "$HOME/.local/share/cockpit/cockpit-monitor" 2>/dev/null || true
fi

restart_existing_units() {
  local prefix="$1"
  shift
  local unit
  local list_cmd=(systemctl list-unit-files --no-legend --plain)

  if [[ "$prefix" == "sudo" ]]; then
    list_cmd=(sudo "${list_cmd[@]}")
  elif [[ "$prefix" == "user" ]]; then
    list_cmd=(systemctl --user list-unit-files --no-legend --plain)
  fi

  for unit in "$@"; do
    if "${list_cmd[@]}" "$unit" 2>/dev/null | awk 'NF>0 {found=1} END{exit !found}'; then
      if [[ "$prefix" == "sudo" ]]; then
        sudo systemctl restart "$unit" >/dev/null 2>&1 || true
      elif [[ "$prefix" == "user" ]]; then
        systemctl --user restart "$unit" >/dev/null 2>&1 || true
      else
        systemctl restart "$unit" >/dev/null 2>&1 || true
      fi
    fi
  done

  return 0
}

if command -v systemctl >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
    restart_existing_units sudo cockpit.socket cockpit.service cockpit-ws.socket cockpit-ws.service || true
  else
    restart_existing_units user cockpit.socket cockpit.service cockpit-ws.socket cockpit-ws.service || true
  fi
fi

echo
echo "Installed cockpit GPU plugin:"
echo "  repo:      ${REPO_SLUG}"
echo "  ref:       ${REF}"
echo "  version:   ${PLUGIN_VERSION}"
echo "  target:    ${INSTALL_DIR}"
echo
echo "Open Cockpit page:"
echo "  /cockpit/@localhost/${PLUGIN_NAME}/"
