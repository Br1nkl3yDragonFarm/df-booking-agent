#!/bin/bash
# ============================================================
#  DRAGON FARM — MAC MINI TOOL SETUP
#
#  Installs the tools from mac-mini/README.md that passed the audit.
#  Run one step at a time, or several:
#
#    ./setup.sh base        Homebrew packages every tool below needs
#    ./setup.sh slides      slide-maker skill (editable PowerPoint decks)
#    ./setup.sh shotcraft   video-shotcraft skill (promo videos of a web page)
#    ./setup.sh founder     founder-skill plugin (pricing, offer, launch)
#    ./setup.sh chatcut     OpenChatCut desktop editor (download + checksum)
#    ./setup.sh bamboo      BambooAI data analyst
#    ./setup.sh weknora     WeKnora label knowledge base (Docker, private)
#    ./setup.sh export      CRM export + daily 7 am refresh
#
#  Safe to run again: steps that are already done are skipped.
#  Tools go in ~/dragon-farm-tools; skills in ~/.claude/skills.
# ============================================================
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TOOLS="$HOME/dragon-farm-tools"
SKILLS="$HOME/.claude/skills"
mkdir -p "$TOOLS" "$SKILLS"

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
need_brew() { command -v brew >/dev/null || { echo "Install Homebrew first: https://brew.sh"; exit 1; }; }

# Clone a repo once; later runs pull the newest commit.
fetch_repo() { # owner/repo dir
  if [ -d "$2/.git" ]; then git -C "$2" pull --ff-only --quiet
  else git clone --depth 1 "https://github.com/$1.git" "$2"; fi
}

# Sets KEY=value in an env file, replacing a live or commented-out line.
set_env() { # file key value
  if grep -qE "^#? ?$2=" "$1"; then sed -i '' -E "s|^#? ?$2=.*|$2=$3|" "$1"
  else printf '%s=%s\n' "$2" "$3" >> "$1"; fi
}

step_base() {
  say "Base packages"
  [ "$(uname -m)" = arm64 ] || note "This Mac is not Apple Silicon; the notes in README.md assume it is."
  need_brew
  brew install git node@22 python@3.12 uv ffmpeg librsvg
  brew link --overwrite node@22 >/dev/null 2>&1 || true
  command -v claude >/dev/null || note "Claude Code not found: npm install -g @anthropic-ai/claude-code"
}

step_slides() {
  say "slide-maker (addsumtech/slides_maker, MIT)"
  need_brew
  brew list --cask libreoffice >/dev/null 2>&1 || brew install --cask libreoffice
  fetch_repo addsumtech/slides_maker "$TOOLS/slides_maker"
  note "Read $TOOLS/slides_maker/skills/slide-maker/scripts/install_skill.py before it runs."
  read -r -p "   Run the installer now? [y/N] " ok
  [ "$ok" = y ] && python3 "$TOOLS/slides_maker/skills/slide-maker/scripts/install_skill.py" --target claude
  note "Optional: export SLIDE_MAKER_NO_VERSION_CHECK=1 to stop its daily update check."
}

step_shotcraft() {
  say "video-shotcraft (Vincentwei1021/video-shotcraft, Apache-2.0)"
  fetch_repo Vincentwei1021/video-shotcraft "$TOOLS/video-shotcraft"
  skill_md="$(find "$TOOLS/video-shotcraft" -maxdepth 3 -name SKILL.md -not -path '*/node_modules/*' | head -1)"
  [ -n "$skill_md" ] || { echo "No SKILL.md found in the repo; check its README."; return 1; }
  skill_dir="$(dirname "$skill_md")"
  ln -sfn "$skill_dir" "$SKILLS/video-shotcraft"
  note "Linked $SKILLS/video-shotcraft -> $skill_dir"
  note "Renders with Remotion: check remotion.dev/license before using videos commercially."
}

step_founder() {
  say "founder-skill (Jakeschincariol/founder-skill, MIT)"
  fetch_repo Jakeschincariol/founder-skill "$TOOLS/founder-skill"
  for d in "$TOOLS"/founder-skill/skills/founder-*; do
    [ -d "$d" ] && ln -sfn "$d" "$SKILLS/$(basename "$d")"
  done
  note "Linked $(ls -d "$SKILLS"/founder-* | wc -l | tr -d ' ') founder skills. Read the four .py helpers in $TOOLS/founder-skill once."
}

step_chatcut() {
  say "OpenChatCut (0xsline/OpenChatCut, AGPL-3.0)"
  version=0.2.17
  sha=ffd89646dc7a8c60cc799178a13130d3b02feb6d9ed3de7749b23fe48ff39802
  dmg="$TOOLS/OpenChatCut-$version-arm64.dmg"
  [ -f "$dmg" ] || curl -fL --progress-bar -o "$dmg" \
    "https://github.com/0xsline/OpenChatCut/releases/download/v$version/OpenChatCut-$version-arm64.dmg" \
    || { echo "Download failed: get the arm64 .dmg from github.com/0xsline/OpenChatCut/releases into $TOOLS"; return 1; }
  got="$(shasum -a 256 "$dmg" | cut -d' ' -f1)"
  if [ "$got" != "$sha" ]; then rm -f "$dmg"; echo "Checksum mismatch; deleted the download. Do not install it."; return 1; fi
  note "Checksum OK. Open $dmg, drag the app to Applications."
  note "It is not notarized: first launch, right-click the app > Open."
  note "Connect it to Claude Code (while the app is open):"
  note "  claude mcp add --transport http openchatcut http://localhost:5199/api/external-mcp/mcp"
}

step_bamboo() {
  say "BambooAI (pgalko/BambooAI, MIT)"
  need_brew
  brew list --cask orbstack >/dev/null 2>&1 || command -v docker >/dev/null || brew install --cask orbstack
  [ -d "$TOOLS/bambooai-venv" ] || uv venv --python 3.12 "$TOOLS/bambooai-venv"
  VIRTUAL_ENV="$TOOLS/bambooai-venv" uv pip install --upgrade bambooai
  note "Start it:  $TOOLS/bambooai-venv/bin/bambooai serve   (Docker/OrbStack must be running)"
  note "Then open http://127.0.0.1:5001 and upload ~/dragon-farm-data/latest/booking.csv."
  note "Keys and models: see the BambooAI README. Never set BAMBOO_COMPUTE=local."
  note "fans.csv holds personal data: analyse it only with a local Ollama model."
}

step_weknora() {
  say "WeKnora (Tencent/WeKnora, MIT)"
  need_brew
  brew list --cask orbstack >/dev/null 2>&1 || command -v docker >/dev/null || brew install --cask orbstack
  brew list ollama >/dev/null 2>&1 || brew install ollama
  brew services start ollama >/dev/null
  ollama pull nomic-embed-text
  fetch_repo Tencent/WeKnora "$TOOLS/WeKnora"
  env="$TOOLS/WeKnora/.env"
  if [ ! -f "$env" ]; then
    cp "$TOOLS/WeKnora/.env.example" "$env"
    chmod 600 "$env"
    # Fresh secrets, written once. Never change SYSTEM_AES_KEY or the
    # database password later: stored keys and data can't be read back.
    set_env "$env" JWT_SECRET "$(openssl rand -hex 32)"
    set_env "$env" SYSTEM_AES_KEY "$(openssl rand -hex 16)"
    set_env "$env" SYSTEM_SIGNING_KEY "$(openssl rand -hex 32)"
    set_env "$env" DB_PASSWORD "$(openssl rand -hex 24)"
    set_env "$env" REDIS_PASSWORD "$(openssl rand -hex 24)"
    set_env "$env" MINIO_ACCESS_KEY_ID "df$(openssl rand -hex 8)"
    set_env "$env" MINIO_SECRET_ACCESS_KEY "$(openssl rand -hex 24)"
    set_env "$env" NEO4J_PASSWORD "$(openssl rand -hex 24)"
    set_env "$env" SEARXNG_SECRET "$(openssl rand -hex 32)"
    # Only this Mac can reach it (not the rest of the network).
    set_env "$env" FRONTEND_PORT 127.0.0.1:8088
    set_env "$env" APP_PORT 127.0.0.1:8080
    note "Wrote $env with new secrets. Back it up (e.g. in your password manager)."
  else
    note "$env already exists; left as is."
  fi
  (cd "$TOOLS/WeKnora" && docker compose pull && docker compose up -d)
  note "Open http://127.0.0.1:8088 and create the admin account."
  note "Models: chat = Anthropic (your API key) or Ollama; embeddings = Ollama, nomic-embed-text."
  note "Upload: ~/dragon-farm-data/latest/summary.md, contracts, EPKs, the label playbooks."
}

step_export() {
  say "CRM export"
  envfile="$HOME/.dragon-farm.env"
  if [ ! -f "$envfile" ]; then
    read -r -p "   Site address (e.g. https://dragonfarmgrowth.net): " site
    read -r -s -p "   Team passcode (DF_CRM_PASSCODE): " pass; echo
    umask 077
    printf 'DF_SITE=%s\nDF_CRM_PASSCODE=%s\n' "$site" "$pass" > "$envfile"
  fi
  node "$HERE/export-crm.mjs"

  plist="$HOME/Library/LaunchAgents/net.dragonfarm.export-crm.plist"
  mkdir -p "$(dirname "$plist")"
  cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>net.dragonfarm.export-crm</string>
  <key>ProgramArguments</key><array>
    <string>$(command -v node)</string><string>$HERE/export-crm.mjs</string>
  </array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardErrorPath</key><string>$HOME/dragon-farm-data/export.log</string>
  <key>StandardOutPath</key><string>$HOME/dragon-farm-data/export.log</string>
</dict></plist>
EOF
  launchctl unload "$plist" 2>/dev/null || true
  launchctl load "$plist"
  note "Refreshes ~/dragon-farm-data/latest every day at 7 am (fan list not included)."
}

[ $# -gt 0 ] || { sed -n '5,16p' "$0" | sed 's/^#//'; exit 0; }
for s in "$@"; do
  case "$s" in
    base|slides|shotcraft|founder|chatcut|bamboo|weknora|export) "step_$s" ;;
    *) echo "Unknown step: $s"; exit 1 ;;
  esac
done
