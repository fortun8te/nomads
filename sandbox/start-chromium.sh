#!/bin/bash
# Find Playwright's Chromium binary and launch it with automation flags
CHROME_BIN=$(find /home/sandbox/.cache-pw -name "chrome" -type f 2>/dev/null | head -1)
if [ -z "$CHROME_BIN" ]; then
  CHROME_BIN=$(find /home/sandbox/.cache-pw -name "chromium" -type f 2>/dev/null | head -1)
fi
if [ -z "$CHROME_BIN" ]; then
  echo "ERROR: Could not find Playwright Chromium binary"
  exit 1
fi
echo "Using Chromium at: $CHROME_BIN"
exec "$CHROME_BIN" \
  --no-sandbox \
  --disable-gpu \
  --disable-dev-shm-usage \
  --disable-software-rasterizer \
  --disable-background-networking \
  --disable-default-apps \
  --disable-extensions \
  --disable-sync \
  --disable-translate \
  --no-first-run \
  --remote-debugging-port=8222 \
  --remote-debugging-address=127.0.0.1 \
  --display=:1 \
  --window-size=1280,900 \
  --start-maximized \
  --disable-infobars \
  --disable-popup-blocking \
  --disable-notifications \
  --autoplay-policy=no-user-gesture-required \
  about:blank
