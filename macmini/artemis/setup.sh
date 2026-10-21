#!/usr/bin/env bash
# Sets up ARTEMIS (github.com/google/artemis) on the Mac mini so Claude Code
# can drive your Android phone (the Galaxy). Safe to run again: it skips what's done.
#
#   bash macmini/artemis/setup.sh
#
# Optional settings (put them before the command):
#   ARTEMIS_DIR=~/artemis    where ARTEMIS is installed
#   ARTEMIS_REF=<commit>     which ARTEMIS version to use (default: the one this kit was checked against)
#   WITH_RULES=1             also copy ARTEMIS's testing rules into ~/.claude/rules (loads into every Claude Code session)
set -euo pipefail

ARTEMIS_DIR="${ARTEMIS_DIR:-$HOME/artemis}"
ARTEMIS_REF="${ARTEMIS_REF:-351ca8422f7b5b54e80a9c1ce03a222e02415b6b}"
WITH_RULES="${WITH_RULES:-0}"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ⚠ %s\n' "$*"; }

# Sets KEY=VALUE in the .env file, replacing the line if it's there.
set_env() {
  local key="$1" value="$2" file="$ARTEMIS_DIR/.env"
  local escaped
  escaped=$(printf '%s' "$value" | sed -e 's/[\\|&]/\\&/g')
  if grep -q "^#\{0,1\} *${key}=" "$file"; then
    sed -i '' -e "s|^#\{0,1\} *${key}=.*|${key}=${escaped}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

# 1. The Mac itself
say "1. Checking the Mac"
if [ "$(uname -s)" != "Darwin" ]; then
  echo "This script is for the Mac mini (macOS)." >&2
  exit 1
fi
ok "macOS $(sw_vers -productVersion) on $(uname -m)"
if ! command -v brew >/dev/null 2>&1; then
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    [ -x "$b" ] && eval "$("$b" shellenv)"
  done
fi
if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is needed first. Install it from https://brew.sh, then run this again." >&2
  exit 1
fi
ok "Homebrew found"

# 2. Tools: git, uv (Python), adb (talks to the phone), scrcpy (phone screen on the Mac), ffmpeg (recordings)
say "2. Installing tools"
for f in git uv scrcpy ffmpeg; do
  if brew list --formula "$f" >/dev/null 2>&1 || command -v "$f" >/dev/null 2>&1; then
    ok "$f already installed"
  else
    brew install "$f"
  fi
done
if command -v adb >/dev/null 2>&1; then
  ok "adb already installed"
else
  brew install --cask android-platform-tools
fi

# 3. ARTEMIS itself, pinned to a known version
say "3. Getting ARTEMIS"
if [ ! -d "$ARTEMIS_DIR/.git" ]; then
  git clone https://github.com/google/artemis.git "$ARTEMIS_DIR"
fi
git -C "$ARTEMIS_DIR" fetch --quiet origin "$ARTEMIS_REF" 2>/dev/null || git -C "$ARTEMIS_DIR" fetch --quiet origin
git -C "$ARTEMIS_DIR" -c advice.detachedHead=false checkout --quiet "$ARTEMIS_REF"
ok "ARTEMIS at $ARTEMIS_DIR ($(git -C "$ARTEMIS_DIR" rev-parse --short HEAD))"
(cd "$ARTEMIS_DIR" && uv sync --quiet)
ok "Python packages installed"

# 4. Settings (.env)
say "4. Settings"
if [ ! -f "$ARTEMIS_DIR/.env" ]; then
  cp "$ARTEMIS_DIR/.env.example" "$ARTEMIS_DIR/.env"
fi
chmod 600 "$ARTEMIS_DIR/.env"
current_key=$(grep -E '^GEMINI_API_KEY=' "$ARTEMIS_DIR/.env" | cut -d= -f2- || true)
if [ -z "$current_key" ]; then
  echo "  ARTEMIS's default models are Gemini, so it needs a Gemini API key."
  echo "  Get one free at https://aistudio.google.com/apikey (it isn't shown as you type or paste)."
  gemini_key=""
  read -r -s -p "  Gemini API key (Enter to skip for now): " gemini_key || true; echo
  if [ -n "$gemini_key" ]; then
    set_env GEMINI_API_KEY "$gemini_key"
    ok "Gemini key saved to $ARTEMIS_DIR/.env (only your user can read it)"
  else
    warn "No key yet. Add GEMINI_API_KEY= to $ARTEMIS_DIR/.env before running a task."
  fi
else
  ok "Gemini key already set"
fi
# The macOS desktop pop-up passes task text to AppleScript unescaped (ARTEMIS issue #139),
# and that text can come from what's on the phone screen. Keep it off.
set_env ARTEMIS_DESKTOP_NOTIFY false
# Only put the ARTEMIS helper app on a phone when you ask for it (artemis helper install).
set_env ARTEMIS_HELPER_AUTO_INSTALL false
ok "Desktop pop-ups off, helper app installs only when asked"

# 5. Connect to Claude Code (only Claude Code: the built-in installer writes to every AI app it knows)
say "5. Connecting Claude Code"
if command -v claude >/dev/null 2>&1; then
  claude mcp remove artemis -s user >/dev/null 2>&1 || true
  claude mcp add artemis -s user \
    -e PYTHONUNBUFFERED=1 \
    -e "PYTHONPATH=$ARTEMIS_DIR" \
    -e ARTEMIS_DESKTOP_NOTIFY=false \
    -- "$ARTEMIS_DIR/.venv/bin/python" -m mcp_server
  ok "Claude Code can now use ARTEMIS (tools named mobile_…)"
  if [ "$WITH_RULES" = "1" ]; then
    mkdir -p "$HOME/.claude/rules"
    cp "$ARTEMIS_DIR/mcp_server/rules.md" "$HOME/.claude/rules/artemis.md"
    ok "Testing rules copied to ~/.claude/rules/artemis.md"
  fi
else
  warn "Claude Code (claude) isn't installed on this Mac, so this step was skipped."
  warn "Install it (https://claude.com/claude-code), then run this script again."
fi

# 6. Check
say "6. Checking everything"
adb start-server >/dev/null 2>&1 || true
devices=$(adb devices | awk 'NR>1 && $2=="device"' | wc -l | tr -d ' ')
if [ "$devices" -gt 0 ]; then
  ok "$devices Android device(s) connected"
else
  warn "The phone isn't connected yet: run phone.sh check (below)."
fi
(cd "$ARTEMIS_DIR" && uv run artemis doctor) || warn "artemis doctor reported problems (see above)."

say "Done."
cat <<EOF
  Next:
  • Connect the Galaxy:  bash $(cd "$(dirname "$0")" && pwd)/phone.sh check   (it says which phone setting is missing)
  • Once, add the helper app:  bash $(cd "$(dirname "$0")" && pwd)/phone.sh helper
  • Try a task:  cd $ARTEMIS_DIR && uv run artemis run "Open Settings and tell me the battery level" --profile flash
  • Or open the web console:  bash $(cd "$(dirname "$0")" && pwd)/console.sh
EOF
