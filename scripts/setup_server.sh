#!/usr/bin/env bash
set +u
set -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

LOG_DIR="$ROOT/.setup-logs"
VENV_DIR="$ROOT/.venv-essentia"
RUNTIME_DIR="$ROOT/.runtime"
NODE_BIN_DIR="$ROOT/bin"
MIN_NODE_MAJOR=18
PYTHON_BIN="${PYTHON_BIN:-}"
NODE_FALLBACK_VERSION="${NODE_FALLBACK_VERSION:-v20.11.1}"
FFMPEG_STATIC_VERSION="${FFMPEG_STATIC_VERSION:-release}"
GENRE_MODEL="${GENRE_MODEL:-maest519}"
export GENRE_MODEL
# Runtime model switching needs every model's files present locally, so the
# installer provisions all of them by default. Override to install a subset,
# e.g. GENRE_MODEL_LIST="maest519".
GENRE_MODEL_LIST="${GENRE_MODEL_LIST:-effnet400 maest519}"

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
  local command_path
  command_path="$(command -v "$1" 2>/dev/null)" || return 1
  [ -n "$command_path" ] && [ -x "$command_path" ]
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
  local version
  version="$(node --version 2>/dev/null)" || return 0
  echo "$version" | sed -E 's/^v([0-9]+).*/\1/'
}

version_lt() {
  awk -v a="${1:-0}" -v b="$2" '
    BEGIN {
      split(a, av, "."); split(b, bv, ".");
      for (i = 1; i <= 3; i++) {
        ai = av[i] + 0; bi = bv[i] + 0;
        if (ai < bi) exit 0;
        if (ai > bi) exit 1;
      }
      exit 1;
    }'
}

system_glibc_version() {
  getconf GNU_LIBC_VERSION 2>/dev/null | awk '{print $2}'
}

node_is_usable() {
  local major
  major="$(node_major)"
  [ -n "$major" ] && [ "$major" -ge "$MIN_NODE_MAJOR" ]
}

load_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    set +u
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
    return 0
  fi
  return 1
}

run_nvm() {
  set +u
  nvm "$@"
}

install_project_node() {
  if ! command_exists curl; then
    echo "curl is required to install project-local Node.js."
    return 1
  fi
  if ! command_exists tar; then
    echo "tar is required to install project-local Node.js."
    return 1
  fi

  local os arch platform flavor base_url archive url install_dir tmp_archive
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os:$arch" in
    Linux:x86_64|Linux:amd64) platform="linux-x64" ;;
    Linux:aarch64|Linux:arm64) platform="linux-arm64" ;;
    Darwin:x86_64) platform="darwin-x64" ;;
    Darwin:arm64) platform="darwin-arm64" ;;
    *)
      echo "Unsupported platform for project-local Node.js: $os $arch"
      return 1
      ;;
  esac

  flavor="$platform"
  base_url="https://nodejs.org/dist/$NODE_FALLBACK_VERSION"

  if [ "$os" = "Linux" ]; then
    local glibc
    glibc="$(system_glibc_version)"
    if [ -n "$glibc" ] && version_lt "$glibc" "2.28"; then
      flavor="$platform-glibc-217"
      base_url="https://unofficial-builds.nodejs.org/download/release/$NODE_FALLBACK_VERSION"
      echo "Detected glibc $glibc; using Node.js $NODE_FALLBACK_VERSION $flavor."
    fi
  fi

  archive="node-$NODE_FALLBACK_VERSION-$flavor.tar.xz"
  url="$base_url/$archive"
  install_dir="$RUNTIME_DIR/node-$NODE_FALLBACK_VERSION-$flavor"
  tmp_archive="$LOG_DIR/$archive"

  if [ ! -x "$install_dir/bin/node" ]; then
    mkdir -p "$RUNTIME_DIR" "$NODE_BIN_DIR"
    curl --fail --location --output "$tmp_archive" "$url"
    tar -xJf "$tmp_archive" -C "$RUNTIME_DIR"
  fi

  mkdir -p "$NODE_BIN_DIR"
  ln -sfn "$install_dir/bin/node" "$NODE_BIN_DIR/node"
  ln -sfn "$install_dir/bin/npm" "$NODE_BIN_DIR/npm"
  if [ -x "$install_dir/bin/npx" ]; then
    ln -sfn "$install_dir/bin/npx" "$NODE_BIN_DIR/npx"
  fi

  export PATH="$NODE_BIN_DIR:$PATH"
  node --version
}

ensure_node() {
  export PATH="$NODE_BIN_DIR:$PATH"

  if node_is_usable; then
    node --version
    return 0
  fi

  local glibc
  glibc="$(system_glibc_version)"
  if [ -n "$glibc" ] && version_lt "$glibc" "2.28"; then
    install_project_node
  elif load_nvm; then
    run_nvm install --lts
    run_nvm use --lts
  else
    if command_exists curl; then
      export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
      load_nvm && run_nvm install --lts && run_nvm alias default 'lts/*' && run_nvm use --lts
    fi
  fi

  if ! node_is_usable; then
    echo "nvm Node.js is not usable on this host; installing project-local Node.js fallback."
    install_project_node || return 1
  fi

  if ! node_is_usable; then
    echo "Node.js >= $MIN_NODE_MAJOR is required; found $(node --version 2>/dev/null || echo missing)."
    return 1
  fi
  node --version
}

detect_python310() {
  if [ -n "$PYTHON_BIN" ] && "$PYTHON_BIN" --version 2>/dev/null | grep -q "Python 3.10"; then
    return 0
  fi

  if [ -x "$VENV_DIR/bin/python" ] && "$VENV_DIR/bin/python" --version 2>/dev/null | grep -q "Python 3.10"; then
    PYTHON_BIN="$VENV_DIR/bin/python"
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

install_miniforge_python310() {
  if ! command_exists curl; then
    echo "curl is required to install Miniforge Python fallback."
    return 1
  fi

  local os arch installer_name installer conda_root url
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os:$arch" in
    Linux:x86_64|Linux:amd64) installer_name="Miniforge3-Linux-x86_64.sh" ;;
    Linux:aarch64|Linux:arm64) installer_name="Miniforge3-Linux-aarch64.sh" ;;
    Darwin:x86_64) installer_name="Miniforge3-MacOSX-x86_64.sh" ;;
    Darwin:arm64) installer_name="Miniforge3-MacOSX-arm64.sh" ;;
    *)
      echo "Unsupported platform for Miniforge fallback: $os $arch"
      return 1
      ;;
  esac

  conda_root="$RUNTIME_DIR/miniforge"
  installer="$LOG_DIR/$installer_name"
  url="https://github.com/conda-forge/miniforge/releases/latest/download/$installer_name"

  if [ ! -x "$conda_root/bin/conda" ]; then
    mkdir -p "$RUNTIME_DIR"
    curl --fail --location --output "$installer" "$url"
    bash "$installer" -b -p "$conda_root"
  fi

  if [ -x "$VENV_DIR/bin/python" ] && "$VENV_DIR/bin/python" --version 2>/dev/null | grep -q "Python 3.10"; then
    PYTHON_BIN="$VENV_DIR/bin/python"
    echo "Using existing Python environment: $VENV_DIR"
    "$PYTHON_BIN" --version
    return 0
  fi

  if [ -d "$VENV_DIR" ]; then
    echo "Removing incomplete Python environment at $VENV_DIR"
    rm -rf "$VENV_DIR"
  fi

  "$conda_root/bin/conda" create -y -p "$VENV_DIR" python=3.10 pip
  PYTHON_BIN="$VENV_DIR/bin/python"
  "$PYTHON_BIN" --version
}

install_python310() {
  if detect_python310; then
    "$PYTHON_BIN" --version
    return 0
  fi

  if command_exists brew; then
    brew install python@3.10 || true
  elif command_exists apt-get; then
    sudo_cmd apt-get update || true
    sudo_cmd apt-get install -y python3.10 python3.10-venv python3.10-dev || true
  elif command_exists dnf; then
    sudo_cmd dnf install -y python3.10 python3.10-devel python3.10-pip || true
  elif command_exists yum; then
    sudo_cmd yum install -y python3.10 python3.10-devel python3.10-pip || true
  fi

  if detect_python310; then
    "$PYTHON_BIN" --version
    return 0
  fi

  echo "Python 3.10 was not available through the system package manager; using Miniforge fallback."
  install_miniforge_python310
}

create_python_env() {
  if [ -x "$VENV_DIR/bin/python" ]; then
    "$VENV_DIR/bin/python" --version
    return 0
  fi
  if [ -z "$PYTHON_BIN" ]; then
    detect_python310 || return 1
  fi
  if ! "$PYTHON_BIN" -m venv "$VENV_DIR"; then
    echo "System Python 3.10 cannot create venv; using Miniforge fallback."
    install_miniforge_python310 || return 1
  fi
  "$VENV_DIR/bin/python" --version
}

python_packages_present() {
  [ -x "$VENV_DIR/bin/yt-dlp" ] || return 1
  "$VENV_DIR/bin/python" - <<'PY' >/dev/null 2>&1
import essentia.standard as es
required = ["TensorflowPredictEffnetDiscogs", "TensorflowPredict2D", "TensorflowPredictMAEST"]
raise SystemExit(0 if all(hasattr(es, name) for name in required) else 1)
PY
}

install_python_packages() {
  if python_packages_present; then
    echo "Python packages already installed in $VENV_DIR"
    "$VENV_DIR/bin/python" -m pip --version
    "$VENV_DIR/bin/yt-dlp" --version
    return 0
  fi

  "$VENV_DIR/bin/python" -m pip install --upgrade pip setuptools wheel &&
    "$VENV_DIR/bin/python" -m pip install --upgrade essentia-tensorflow yt-dlp
}

static_ffmpeg_arch() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  [ "$os" = "Linux" ] || return 1

  case "$arch" in
    x86_64|amd64) echo "amd64" ;;
    aarch64|arm64) echo "arm64" ;;
    i386|i686) echo "i686" ;;
    armv7l|armv7*) echo "armhf" ;;
    armv6l|armv6*) echo "armel" ;;
    *) return 1 ;;
  esac
}

install_static_ffmpeg() {
  local arch archive url install_dir tmp_archive extracted_dir
  arch="$(static_ffmpeg_arch)" || {
    echo "No supported static ffmpeg build for $(uname -s) $(uname -m)."
    return 1
  }
  command_exists curl || {
    echo "curl is required to download static ffmpeg."
    return 1
  }
  command_exists tar || {
    echo "tar is required to unpack static ffmpeg."
    return 1
  }

  archive="ffmpeg-${FFMPEG_STATIC_VERSION}-${arch}-static.tar.xz"
  url="https://johnvansickle.com/ffmpeg/releases/$archive"
  install_dir="$RUNTIME_DIR/ffmpeg-${FFMPEG_STATIC_VERSION}-${arch}"
  tmp_archive="$LOG_DIR/$archive"

  if [ ! -x "$install_dir/ffmpeg" ] || [ ! -x "$install_dir/ffprobe" ]; then
    rm -rf "$install_dir" "$LOG_DIR"/ffmpeg-*-static
    echo "Downloading static ffmpeg from $url"
    echo "This archive can be large; timeout is 15 minutes."
    curl --fail --location --connect-timeout 20 --max-time 900 --output "$tmp_archive" "$url"
    tar -xJf "$tmp_archive" -C "$LOG_DIR"
    extracted_dir="$(find "$LOG_DIR" -maxdepth 1 -type d -name "ffmpeg-*-static" | head -n 1)"
    if [ -z "$extracted_dir" ]; then
      echo "Could not find unpacked ffmpeg static directory."
      return 1
    fi
    mkdir -p "$RUNTIME_DIR"
    mv "$extracted_dir" "$install_dir"
  fi

  mkdir -p "$NODE_BIN_DIR"
  ln -sfn "$install_dir/ffmpeg" "$NODE_BIN_DIR/ffmpeg"
  ln -sfn "$install_dir/ffprobe" "$NODE_BIN_DIR/ffprobe"
  export PATH="$NODE_BIN_DIR:$PATH"
}

install_ffmpeg() {
  local ffmpeg_path ffprobe_path
  export PATH="$NODE_BIN_DIR:$PATH"

  if ! command_exists ffmpeg || ! command_exists ffprobe; then
    if command_exists brew; then
      brew install ffmpeg || true
    elif command_exists apt-get; then
      sudo_cmd apt-get update || true
      sudo_cmd apt-get install -y ffmpeg || true
    elif command_exists dnf; then
      sudo_cmd dnf install -y ffmpeg || true
    elif command_exists yum; then
      sudo_cmd yum install -y ffmpeg || true
    elif command_exists apk; then
      sudo_cmd apk add --no-cache ffmpeg || true
    else
      echo "No supported package manager found. Install ffmpeg manually, or set FFMPEG_LOCATION."
    fi
  fi

  if ! command_exists ffmpeg || ! command_exists ffprobe; then
    echo "System package manager did not provide ffmpeg; installing project-local static ffmpeg."
    install_static_ffmpeg || true
  fi

  if ! command_exists ffmpeg || ! command_exists ffprobe; then
    echo "ffmpeg and ffprobe are required for yt-dlp audio postprocessing."
    return 1
  fi

  ffmpeg_path="$(command -v ffmpeg)"
  ffprobe_path="$(command -v ffprobe)"

  mkdir -p "$NODE_BIN_DIR"
  if [ "$ffmpeg_path" != "$NODE_BIN_DIR/ffmpeg" ]; then
    ln -sfn "$ffmpeg_path" "$NODE_BIN_DIR/ffmpeg"
  fi
  if [ "$ffprobe_path" != "$NODE_BIN_DIR/ffprobe" ]; then
    ln -sfn "$ffprobe_path" "$NODE_BIN_DIR/ffprobe"
  fi

  "$NODE_BIN_DIR/ffmpeg" -version | head -n 1
  "$NODE_BIN_DIR/ffprobe" -version | head -n 1
}

verify_essentia() {
  GENRE_MODEL_LIST="$GENRE_MODEL_LIST" "$VENV_DIR/bin/python" - <<'PY'
import os
import essentia
import essentia.standard as es

models = os.environ.get("GENRE_MODEL_LIST", "maest519").split()
print("essentia", essentia.__version__)

requirements = {
    "effnet400": ["TensorflowPredictEffnetDiscogs", "TensorflowPredict2D"],
    "maest519": ["TensorflowPredictMAEST"],
}

required = []
for model in models:
    for name in requirements.get(model, ["TensorflowPredictMAEST"]):
        if name not in required:
            required.append(name)

ok = True
for name in required:
    present = hasattr(es, name)
    print(name, present)
    ok = ok and present

raise SystemExit(0 if ok else 1)
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
  curl --fail --location --connect-timeout 20 --max-time 900 --output "$tmp" "$url"
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

  local target
  for target in $GENRE_MODEL_LIST; do
    echo "== Downloading model files for: $target =="
    if [ "$target" = "effnet400" ]; then
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
        1000 || return 1
    else
      download_file \
        "$ROOT/models/discogs-maest-30s-pw-519l-2.pb" \
        "https://essentia.upf.edu/models/feature-extractors/maest/discogs-maest-30s-pw-519l-2.pb" \
        1000000 &&

      download_file \
        "$ROOT/models/discogs-maest-30s-pw-519l-2.json" \
        "https://essentia.upf.edu/models/feature-extractors/maest/discogs-maest-30s-pw-519l-2.json" \
        1000 || return 1
    fi
  done
}

verify_taxonomy() {
  local target
  for target in $GENRE_MODEL_LIST; do
    test -s "data/$target/discogs-taxonomy.json" &&
      test -s "data/$target/discogs-style-profiles.json" || return 1
  done
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

  printf '%s\n' '------------------------------------------------------'
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
  run_step "ffmpeg / ffprobe" install_ffmpeg
  run_step "Essentia import" verify_essentia
  run_step "yt-dlp" verify_ytdlp
  run_step "Essentia models" download_models
  run_step "Discogs taxonomy" verify_taxonomy
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
