#!/data/data/com.termux/files/usr/bin/bash
# Sets up the WhatsApp bot on an Android phone, inside the Termux app.
# In Termux run:
#   curl -fsSL https://raw.githubusercontent.com/prasant793001-stack/What-am-i-now-android/main/whatsapp-bot/setup-android.sh | bash
set -e
echo "== Installing Node.js and Git (a few minutes)"
yes | pkg update >/dev/null 2>&1 || true
yes | pkg install nodejs-lts git procps

DIR="$HOME/roster"
echo "== Downloading the roster code"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone https://github.com/prasant793001-stack/What-am-i-now-android.git "$DIR"; fi
cd "$DIR/whatsapp-bot"
echo "== Installing the bot"
npm install --no-audit --no-fund

# Start script: keeps the phone awake for Termux and restarts the bot if it ever stops.
cat > "$HOME/start-bot.sh" <<'RUN'
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
cd "$HOME/roster/whatsapp-bot"
while true; do
  node bot.mjs
  echo "Bot stopped. Restarting in 10 seconds..."
  sleep 10
done
RUN
chmod +x "$HOME/start-bot.sh"

# Update script: get the latest code from GitHub.
cat > "$HOME/update-bot.sh" <<'UPD'
#!/data/data/com.termux/files/usr/bin/bash
cd "$HOME/roster" && git pull --ff-only && cd whatsapp-bot && npm install --no-audit --no-fund
echo "Updated. Close Termux completely and open it again (or run: ~/start-bot.sh)."
UPD
chmod +x "$HOME/update-bot.sh"

# Start automatically after the phone restarts (needs the free "Termux:Boot" app opened once).
mkdir -p "$HOME/.termux/boot"
printf '#!/data/data/com.termux/files/usr/bin/bash\n$HOME/start-bot.sh\n' > "$HOME/.termux/boot/start-bot.sh"
chmod +x "$HOME/.termux/boot/start-bot.sh"

# Start the bot whenever Termux is opened, if it isn't already running.
grep -q "start-bot.sh" "$HOME/.bashrc" 2>/dev/null || echo 'pgrep -f "node bot.mjs" >/dev/null || ~/start-bot.sh' >> "$HOME/.bashrc"

echo
echo "All set! Starting the bot now. A PAIRING CODE will appear in a few seconds."
echo "Then: open WhatsApp > Settings > Linked devices > Link a device > Link with phone number instead > type the code."
echo
exec "$HOME/start-bot.sh"
