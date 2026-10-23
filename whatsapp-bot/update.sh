#!/usr/bin/env bash
# Get the latest code from GitHub and restart the bot.
set -euo pipefail
cd "$HOME/roster" && git pull --ff-only
cd whatsapp-bot && npm install --no-audit --no-fund
sudo systemctl restart roster-bot
echo "Updated and restarted. Logs: journalctl -u roster-bot -f"
