#!/bin/bash
# Sets up a clean, searchable local copy of github.com/cporter202/API-mega-list on a Mac.
# Run from Terminal:  bash mac-mini/api-mega-list/setup.sh
# Run it again any time to pull the latest list and rebuild.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="$HOME/API-mega-list"
CLONE="$HOME_DIR/source"
OUT="$HOME_DIR/index"

# git and python3 come with Apple's Command Line Tools
if ! xcode-select -p >/dev/null 2>&1; then
  echo "Installing Apple Command Line Tools (git, python3). Click Install in the pop-up, then run this script again."
  xcode-select --install
  exit 1
fi

mkdir -p "$HOME_DIR"
if [ -d "$CLONE/.git" ]; then
  echo "Updating the list..."
  git -C "$CLONE" pull --ff-only --depth 1
else
  echo "Downloading the list (about 40 MB)..."
  git clone --depth 1 https://github.com/cporter202/API-mega-list.git "$CLONE"
fi

# The repo is only Markdown plus three README generator scripts. Nothing from it is executed here.
python3 -I "$HERE/build_index.py" build "$CLONE" "$OUT"

# One-word search command:  apisearch instagram scraper
mkdir -p "$HOME/bin"
cat > "$HOME/bin/apisearch" <<EOF
#!/bin/bash
python3 -I "$HERE/build_index.py" search "$OUT" "\$@"
EOF
chmod +x "$HOME/bin/apisearch"
if ! grep -q 'HOME/bin' "$HOME/.zshrc" 2>/dev/null; then
  echo 'export PATH="$HOME/bin:$PATH"' >> "$HOME/.zshrc"
fi

echo
echo "Done."
echo "  Search page:  open \"$OUT/index.html\""
echo "  Spreadsheet:  $OUT/api-index.csv"
echo "  Terminal:     apisearch bandsintown   (open a new Terminal window first)"
open "$OUT/index.html"
