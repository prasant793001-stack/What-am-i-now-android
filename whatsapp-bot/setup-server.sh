#!/usr/bin/env bash
# One-time setup of the WhatsApp bot on a fresh Ubuntu server (Oracle Cloud, Google Cloud, ...).
# Usage:  bash setup-server.sh 971501234567      <- the WhatsApp number the bot will use
set -euo pipefail
BOT_NUMBER="${1:-}"
REPO="${REPO:-https://github.com/prasant793001-stack/What-am-i-now-android.git}"
DIR="$HOME/roster"

echo "== Installing git and Node.js"
sudo apt-get update -y
sudo apt-get install -y git curl ca-certificates
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# Small (1 GB) servers: add swap so the install doesn't run out of memory.
if [ "$(free -m | awk '/Mem:/{print $2}')" -lt 1500 ] && ! swapon --show | grep -q .; then
  echo "== Adding 2 GB swap"
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "== Downloading the roster code"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone "$REPO" "$DIR"; fi
cd "$DIR/whatsapp-bot"
npm install --no-audit --no-fund

mkdir -p data
if [ -n "$BOT_NUMBER" ]; then
  echo "{ \"botNumber\": \"$(echo "$BOT_NUMBER" | tr -cd '0-9')\" }" > data/config.json
fi
sudo timedatectl set-timezone Asia/Dubai || true

echo "== Making the bot start automatically (and restart if it stops)"
sudo tee /etc/systemd/system/roster-bot.service >/dev/null <<UNIT
[Unit]
Description=What Am I Now WhatsApp bot
After=network-online.target
Wants=network-online.target

[Service]
User=$USER
WorkingDirectory=$DIR/whatsapp-bot
ExecStart=$(command -v node) bot.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now roster-bot

cat <<MSG

All set. The bot is running. Watch it (and get the WhatsApp pairing code) with:

    journalctl -u roster-bot -f

Press Ctrl+C to stop watching; the bot keeps running.
To update later:  bash ~/roster/whatsapp-bot/update.sh
MSG
