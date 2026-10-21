#!/usr/bin/env bash
# Opens the ARTEMIS web console on the Mac mini (http://localhost:8000).
# Only this Mac can reach it; it has no login, so don't open port 8000 to the network.
# Stop it with Ctrl-C, or: cd ~/artemis && uv run artemis stop
set -euo pipefail

ARTEMIS_DIR="${ARTEMIS_DIR:-$HOME/artemis}"
if [ ! -x "$ARTEMIS_DIR/start.sh" ]; then
  echo "ARTEMIS isn't installed at $ARTEMIS_DIR. Run setup.sh first." >&2
  exit 1
fi

cd "$ARTEMIS_DIR"
# Open the browser once the console answers.
(for _ in $(seq 1 120); do
   if curl -fs -o /dev/null http://localhost:8000; then open http://localhost:8000; exit 0; fi
   sleep 2
 done) &
# With no keyboard attached, start.sh skips its own "install for every AI app" step;
# setup.sh already connected Claude Code. The first run also builds the console (a few minutes).
exec ./start.sh </dev/null
