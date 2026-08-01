#!/bin/bash
set -euo pipefail

LOG_DIR="/var/log/kiro-xpra"
mkdir -p "$LOG_DIR"

export DISPLAY=:99

echo "[$(date)] Starting Xpra session..." >> "$LOG_DIR/start.log"

# Clean up stale files
for f in /tmp/.X99-lock /tmp/.X11-unix/X99; do
    if [[ -e "$f" ]]; then
        echo "Removing stale file: $f" >> "$LOG_DIR/start.log"
        rm -f "$f"
    fi
done

# Clean up stale xpra socket files
find /run/user/0/xpra/ /root/.xpra/ /run/xpra/ -name "*:99*" -delete 2>/dev/null || true

# Kill any existing processes
pkill -f ":99" || true
pkill -f "Kiro-account-manager.*electron" || true
sleep 2

# Start xpra with HTML5 websocket support
xpra \
    start :99 \
    --daemon=no \
    --start-child=/root/kiro/start-electron.sh \
    --exit-with-children \
    --bind-ws=0.0.0.0:14500 \
    --html=on \
    --ssl=on \
    --ssl-cert=/etc/letsencrypt/live/kiro.router.plus/fullchain.pem \
    --ssl-key=/etc/letsencrypt/live/kiro.router.plus/privkey.pem \
    --log-dir="$LOG_DIR"
