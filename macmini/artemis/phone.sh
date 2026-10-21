#!/usr/bin/env bash
# Connects the Samsung Galaxy (or any Android phone) to ARTEMIS on the Mac mini.
#
#   bash macmini/artemis/phone.sh check    # is the phone connected and ready? (default)
#   bash macmini/artemis/phone.sh helper   # put the ARTEMIS helper app on the phone and turn it on
#   bash macmini/artemis/phone.sh wifi     # connect over Wi-Fi instead of the cable
#   bash macmini/artemis/phone.sh undo     # put the phone back to normal when you're done with ARTEMIS
set -euo pipefail

ARTEMIS_DIR="${ARTEMIS_DIR:-$HOME/artemis}"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ⚠ %s\n' "$*"; }

if ! command -v adb >/dev/null 2>&1; then
  echo "adb isn't installed. Run macmini/artemis/setup.sh first." >&2
  exit 1
fi
adb start-server >/dev/null 2>&1 || true

samsung_steps() {
  cat <<'EOF'
  On the Galaxy:
  1. Settings → About phone → Software information → tap "Build number" 7 times (enter your PIN).
  2. Settings → Developer options → turn on "USB debugging".
  3. Settings → Security and privacy → Auto Blocker → turn it off while you use ARTEMIS
     (it blocks commands over the USB cable). Turn it back on afterwards: phone.sh undo reminds you.
  4. Plug the phone into the Mac mini with a USB-C cable that carries data (not a charge-only one).
  5. Unlock the phone and tap "Allow" on "Allow USB debugging?" (tick "Always allow from this computer").
EOF
}

# Prints the serial of the one ready phone, or nothing.
ready_serial() {
  adb devices | awk 'NR>1 && $2=="device" {print $1}' | head -n 1
}

check() {
  say "Phone"
  local list unauthorized count serial
  list=$(adb devices | awk 'NR>1 && NF')
  unauthorized=$(printf '%s\n' "$list" | awk '$2=="unauthorized"' | wc -l | tr -d ' ')
  count=$(printf '%s\n' "$list" | awk '$2=="device"' | wc -l | tr -d ' ')
  if [ "$count" -eq 0 ]; then
    if [ "$unauthorized" -gt 0 ]; then
      warn "The phone is plugged in but hasn't said yes. Unlock it and tap \"Allow\" on \"Allow USB debugging?\"."
      warn "No pop-up? Developer options → \"Revoke USB debugging authorizations\", then unplug and plug back in."
    else
      warn "No phone found."
      samsung_steps
    fi
    return 1
  fi
  if [ "$count" -gt 1 ]; then
    warn "$count devices connected. Keep only the Galaxy connected (ARTEMIS issue #135: a batch can pick the wrong one)."
  fi
  serial=$(ready_serial)
  local model android oneui stayon
  model=$(adb -s "$serial" shell getprop ro.product.model | tr -d '\r')
  android=$(adb -s "$serial" shell getprop ro.build.version.release | tr -d '\r')
  oneui=$(adb -s "$serial" shell getprop ro.build.version.oneui | tr -d '\r')
  # Samsung stores One UI as a number: 80100 is One UI 8.1.
  if [[ "$oneui" =~ ^[0-9]{5,}$ ]]; then
    oneui="$((oneui / 10000)).$(((oneui / 100) % 100))"
  fi
  ok "Connected: $model, Android $android${oneui:+ (One UI $oneui)}"
  stayon=$(adb -s "$serial" shell settings get global stay_on_while_plugged_in | tr -d '\r')
  if [ "$stayon" != "0" ] && [ -n "$stayon" ]; then
    warn "Screen is set to stay on while plugged into a computer (ARTEMIS does this). phone.sh undo turns it off."
  fi
  if [ -d "$ARTEMIS_DIR" ]; then
    (cd "$ARTEMIS_DIR" && uv run artemis helper status --serial "$serial") \
      || warn "Couldn't read the helper app's status. Run: bash macmini/artemis/phone.sh helper"
  fi
}

helper() {
  check
  say "Helper app"
  (cd "$ARTEMIS_DIR" && uv run artemis helper install --serial "$(ready_serial)")
  cat <<'EOF'
  If the phone says the helper isn't on:
  • Settings → Accessibility → Installed apps → Artemis Accessibility Helper → turn it on.
  • If the switch is greyed out ("Restricted setting"): Settings → Apps → Artemis Accessibility Helper
    → ⋮ (top right) → "Allow restricted settings", then try the switch again.
EOF
}

wifi() {
  say "Connect over Wi-Fi"
  cat <<'EOF'
  The phone and the Mac mini must be on the same Wi-Fi.
  On the Galaxy: Settings → Developer options → Wireless debugging → turn on
  → "Pair device with pairing code". Keep that screen open.
EOF
  local pair_addr code connect_addr
  read -r -p "  IP address & port shown under the pairing code (like 192.168.1.20:37015): " pair_addr
  read -r -p "  Wi-Fi pairing code (6 digits): " code
  adb pair "$pair_addr" "$code"
  echo
  echo "  Now look at the main Wireless debugging screen (not the pairing pop-up)."
  read -r -p "  IP address & port shown there (like 192.168.1.20:41233): " connect_addr
  adb connect "$connect_addr"
  ok "Connected over Wi-Fi. The port changes each time Wireless debugging restarts; run this again if it drops."
  warn "Over Wi-Fi the screen can lock mid-task. Keep the phone unlocked while ARTEMIS works."
}

undo() {
  say "Putting the phone back to normal"
  local serial
  serial=$(ready_serial)
  if [ -n "$serial" ]; then
    adb -s "$serial" shell svc power stayon false && ok "Screen times out normally again when plugged in"
    if [ -d "$ARTEMIS_DIR" ]; then
      read -r -p "  Also remove the ARTEMIS helper app from the phone? [y/N]: " rm_helper || true
      if [[ "${rm_helper:-}" =~ ^[Yy]$ ]]; then
        (cd "$ARTEMIS_DIR" && uv run artemis helper uninstall --serial "$serial" --yes) && ok "Helper app removed"
      fi
    fi
  else
    warn "No phone connected, so nothing was changed on it. Connect it and run this again."
  fi
  cat <<'EOF'
  On the Galaxy, when you're done for a while:
  • Settings → Security and privacy → Auto Blocker → turn it back on.
  • Settings → Developer options → turn off "USB debugging" and "Wireless debugging".
EOF
}

case "${1:-check}" in
  check)  check ;;
  helper) helper ;;
  wifi)   wifi ;;
  undo)   undo ;;
  *) echo "Usage: bash macmini/artemis/phone.sh [check|helper|wifi|undo]" >&2; exit 2 ;;
esac
