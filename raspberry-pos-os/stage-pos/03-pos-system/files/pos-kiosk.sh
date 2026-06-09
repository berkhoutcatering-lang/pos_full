#!/bin/bash
# Launches Chromium fullscreen inside the cage Wayland kiosk compositor.
set -eu

URL="$(cat /etc/pos/kiosk.url)"
BROWSER="$(command -v chromium-browser || command -v chromium)"

# Created by pam_systemd (PAMName=login in the unit); never fail on it.
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
mkdir -p "${XDG_RUNTIME_DIR}" 2>/dev/null || true

exec /usr/bin/cage -- "${BROWSER}" \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --disable-session-crashed-bubble \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  "${URL}"
