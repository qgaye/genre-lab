#!/usr/bin/env bash
set -u
set -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

LOG_DIR="$ROOT/.setup-logs"
VENV_DIR="$ROOT/.venv-essentia"
MIN_NODE_MAJOR=18
PYTHON_BIN="${PYTHON_BIN:-}"

mkdir -p "$LOG_DIR"

SUMMARY_NAMES=()
SUMMARY_STATUS=()
SUMMARY_DETAILS=()

record_result() {
  SUMMARY_NAMES+=("$1")
  SUMMARY_STATUS+=("$2")
  SUMMARY_DETAILS+=("$3")
}

print_header() {
  printf "\n== %s ==\n" "$1"
}

run_step() {
  local name="$1"
  shift
  local log_file="$LOG_DIR/$(printf "%02d" "$((${#SUMMARY_NAMES[@]} + 1))")-$(echo "$name" | tr ' /' '__').log"

  print_header "$name"
  printf "Log: %s\n" "$log_file"

  if "$@" >"$log_file" 2>&1; then
    record_result "$name" "OK" "$log_file"
    printf "Result: OK\n"
    return 0
  fi

  record_result "$name" "FAIL" "$log_file"
  printf "Result: FAIL\n"
  tail -n 20 "$log_file" || true
  return 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

sudo_cmd() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command_exists sudo; then
    sudo "$@"
  else
    return 1
  fi
}

node_major() {
  node --version 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/'
}

load_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
    return 0
  fi
  return 1
}

ensure_node() {
  if command_exists node; then
    local major
    major="$(node_major)"
    if [ "${major:-0}" -ge "$MIN_NODE_MAJOR" ]; then
      node --version
      return 0
    fi
  fi

  if load_nvm; then
    nvm install --lts
    nvm use --lts
  else
    if ! command_exists curl; then
      echo "curl is required to install Node.js through nvm."
      return 1
    fi
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
    load_nvm
    nvm install --lts
    nvm alias default 'lts/*'
    nvm use --lts
  fi

  local major
  major="$(node_major)"
  if [ "${major:-0}" -lt "$MIN_NODE_MAJOR" ]; then
    echo "Node.js >= $MIN_NODE_MAJOR is required; found $(node --version 2>/dev/null || echo missing)."
    return 1
  fi
  node --version
}

detect_python310() {
  if [ -n "$PYTHON_BIN" ] && "$PYTHON_BIN" --version 2>/dev/null | grep -q "Python 3.10"; then
    return 0
  fi

  if command_exists python3.10; then
    PYTHON_BIN="$(command -v python3.10)"
    return 0
  fi

  if command_exists python3 && python3 --version 2>/dev/null | grep -q "Python 3.10"; then
    PYTHON_BIN="$(command -v python3)"
    return 0
  fi

  if command_exists brew; then
    local brew_python
    brew_python="$(brew --prefix python@3.10 2>/dev/null)/bin/python3.10"
    if [ -x "$brew_python" ]; then
      PYTHON_BIN="$brew_python"
      return 0
    fi
  fi

  return 1
}

install_python310() {
  if detect_python310; then
    "$PYTHON_BIN" --version
    return 0
  fi

  if command_exists brew; then
    brew install python@3.10
  elif command_exists apt-get; then
    sudo_cmd apt-get update
    sudo_cmd apt-get install -y python3.10 python3.10-venv python3.10-dev
  else
    echo "Could not find Python 3.10 and no supported package manager was found."
    echo "Install Python 3.10, then rerun this script."
    return 1
  fi

  detect_python310
  "$PYTHON_BIN" --version
}

create_python_env() {
  if [ -z "$PYTHON_BIN" ]; then
    detect_python310 || return 1
  fi
  "$PYTHON_BIN" -m venv "$VENV_DIR"
  "$VENV_DIR/bin/python" --version
}

install_python_packages() {
  "$VENV_DIR/bin/python" -m pip install --upgrade pip setuptools wheel &&
    "$VENV_DIR/bin/python" -m pip install --upgrade essentia-tensorflow yt-dlp
}

verify_essentia() {
  "$VENV_DIR/bin/python" - <<'PY'
import essentia
import essentia.standard as es
print("essentia", essentia.__version__)
print("TensorflowPredictEffnetDiscogs", hasattr(es, "TensorflowPredictEffnetDiscogs"))
print("TensorflowPredict2D", hasattr(es, "TensorflowPredict2D"))
raise SystemExit(0 if hasattr(es, "TensorflowPredictEffnetDiscogs") and hasattr(es, "TensorflowPredict2D") else 1)
PY
}

verify_ytdlp() {
  "$VENV_DIR/bin/yt-dlp" --version
}

download_file() {
  local output="$1"
  local url="$2"
  local min_bytes="$3"

  mkdir -p "$(dirname "$output")"
  if [ -s "$output" ]; then
    local size
    size="$(wc -c <"$output" | tr -d ' ')"
    if [ "$size" -ge "$min_bytes" ]; then
      echo "Already present: $output ($size bytes)"
      return 0
    fi
  fi

  local tmp="${output}.part"
  rm -f "$tmp"
  curl --fail --location --output "$tmp" "$url"
  local size
  size="$(wc -c <"$tmp" | tr -d ' ')"
  if [ "$size" -lt "$min_bytes" ]; then
    echo "Downloaded file is too small: $output ($size bytes)"
    rm -f "$tmp"
    return 1
  fi
  mv "$tmp" "$output"
  echo "Downloaded: $output ($size bytes)"
}

download_models() {
  if ! command_exists curl; then
    echo "curl is required to download Essentia model files."
    return 1
  fi

  download_file \
    "$ROOT/models/discogs-effnet-bs64-1.pb" \
    "https://essentia.upf.edu/models/feature-extractors/discogs-effnet/discogs-effnet-bs64-1.pb" \
    1000000 &&

  download_file \
    "$ROOT/models/discogs-effnet-bs64-1.json" \
    "https://essentia.upf.edu/models/feature-extractors/discogs-effnet/discogs-effnet-bs64-1.json" \
    1000 &&

  download_file \
    "$ROOT/models/genre_discogs400-discogs-effnet-1.pb" \
    "https://essentia.upf.edu/models/classification-heads/genre_discogs400/genre_discogs400-discogs-effnet-1.pb" \
    100000 &&

  download_file \
    "$ROOT/models/genre_discogs400-discogs-effnet-1.json" \
    "https://essentia.upf.edu/models/classification-heads/genre_discogs400/genre_discogs400-discogs-effnet-1.json" \
    1000
}

build_taxonomy() {
  node scripts/build_discogs_taxonomy.js &&
    test -s data/discogs-taxonomy.json &&
    test -s public/discogs-taxonomy.js
}

check_javascript() {
  node --check server.js &&
    node --check public/app.js
}

check_model_script() {
  "$VENV_DIR/bin/python" scripts/analyze_genre.py --help >/dev/null
}

print_summary() {
  printf "\n================ Installation summary ================\n"
  local ok_count=0
  local fail_count=0

  for i in "${!SUMMARY_NAMES[@]}"; do
    local status="${SUMMARY_STATUS[$i]}"
    if [ "$status" = "OK" ]; then
      ok_count=$((ok_count + 1))
    else
      fail_count=$((fail_count + 1))
    fi
    printf "%-34s %-6s %s\n" "${SUMMARY_NAMES[$i]}" "$status" "${SUMMARY_DETAILS[$i]}"
  done

  printf "------------------------------------------------------\n"
  printf "OK: %s  FAIL: %s\n" "$ok_count" "$fail_count"

  if [ "$fail_count" -eq 0 ]; then
    printf "\nAll dependencies are installed.\n"
    printf "Start the app with:\n\n"
    printf "  npm start\n\n"
    printf "Then open:\n\n"
    printf "  http://127.0.0.1:4173\n"
  else
    printf "\nSome steps failed. Open the log files listed above for details, fix the issue, then rerun this script.\n"
  fi
}

main() {
  print_header "Genre Lab dependency setup"
  printf "Project root: %s\n" "$ROOT"
  printf "Logs: %s\n" "$LOG_DIR"

  run_step "Node.js >= 18" ensure_node
  run_step "Python 3.10" install_python310
  run_step "Python virtualenv" create_python_env
  run_step "Python packages" install_python_packages
  run_step "Essentia import" verify_essentia
  run_step "yt-dlp" verify_ytdlp
  run_step "Essentia models" download_models
  run_step "Discogs taxonomy" build_taxonomy
  run_step "JavaScript syntax" check_javascript
  run_step "Analyze script" check_model_script

  print_summary

  for status in "${SUMMARY_STATUS[@]}"; do
    if [ "$status" = "FAIL" ]; then
      exit 1
    fi
  done
}

main "$@"
