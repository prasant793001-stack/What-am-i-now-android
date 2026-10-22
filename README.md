# What Am I Now? (website + WhatsApp alerts)

Two parts:

1. **The website.** Plain files with no build step and no app stores. The roster data stays in your existing Firebase project.
2. **The WhatsApp bot (optional).** A small program on an always-on device. A few minutes before every role change, it sends each person **their own** role:

```
⏰ *Prashant*, in 3 min it's your *GREETER* time
🕑 2:00–3:00 PM
↪️ Moving from SAS1 · next: TAB1 at 3:00 PM
```

Sick leave, wheel spins and settings changes are picked up automatically, because every message is worked out from the live roster just before it's sent. Nobody on leave gets messages, and neither does anyone on a day off.

---

## Files

| File | What it is |
|---|---|
| `index.html` | The website: roster, sick leave, spin wheel, avatars, alerts, Google Calendar |
| `roster-engine.js` | The roster calculation, shared by the website and the bot so they always agree |
| `firebase-config.js` | Your Firebase keys (copy your filled-in one over this) |
| `firestore.rules` | Database rules (unchanged) |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Let phones use "Add to Home Screen" and pop-up notifications |
| `package.json` | Needed by the bot only. The website ignores it |
| `whatsapp-bot/` | The WhatsApp bot |

---

## Part 1: Put the website online (free, GitHub Pages)

1. Copy your old filled-in `firebase-config.js` over the one here.
2. Upload everything in this folder to a GitHub repository, including `.gitignore`. Replace the old Android project's files.
3. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save.**
4. The site goes live at `https://YOUR-USERNAME.github.io/REPO-NAME/` in about a minute.
5. If the address is new: Firebase → **Authentication → Settings → Authorized domains** → add `YOUR-USERNAME.github.io`.
6. Delete `android/app/roster-team.keystore` from the old repo (it was the Android signing key).

On phones: open the site, then **Share → Add to Home Screen** (iPhone) or **⋮ → Add to Home screen** (Android).

---

## Part 2: The WhatsApp bot

### Which number?

The bot links to a WhatsApp number as a "linked device", the same way WhatsApp Web does. It's free, but it is **not an official WhatsApp tool**. WhatsApp can ban numbers it suspects are automated. The risk is low for a small team that asked for the messages, but it isn't zero.

- **Best:** a cheap prepaid SIM or eSIM used only for this. Set up WhatsApp on any phone with it once, then link the bot.
- **Possible:** your own number. The bot ignores normal chats and only answers START, STOP, NOW and HELP. If the number got banned, though, you'd lose your own WhatsApp.
- Don't use the free "temporary numbers" websites. Those numbers are shared, so other people can take over the account.

To keep the risk low, colleagues send the bot a message first (the website button does this), save the number as a contact, and only colleagues who asked for messages receive them.

### Where to run it (pick one, all free)

The bot must be running during shifts to send messages.

**A. An old Android phone (recommended).** Keep it plugged in and on Wi-Fi.
1. Install **Termux** from **F-Droid** (https://f-droid.org). The Play Store version is outdated.
2. In Termux:
   ```bash
   pkg update && pkg install nodejs-lts git nano
   git clone https://github.com/YOUR-USERNAME/REPO-NAME.git roster
   cd roster/whatsapp-bot
   npm install
   ```
3. Phone settings → Apps → Termux → Battery → **Unrestricted**. In Termux run `termux-wake-lock` so Android doesn't put it to sleep.

**B. A Windows or Mac computer** that stays on during shifts.
Install **Node.js LTS** (https://nodejs.org) and **Git** (https://git-scm.com). Download the repository, open a terminal in the `whatsapp-bot` folder and run `npm install`.

**C. A free cloud server: Oracle Cloud "Always Free" (recommended, nothing to keep switched on)**
1. Sign up at https://signup.cloud.oracle.com. Choose **Home region: UAE East (Dubai)** (it can't be changed later). A card is needed for verification and isn't charged.
2. Recommended: **Upgrade to Pay As You Go** (Billing → Upgrade). You still pay nothing while you stay inside the Always Free limits, and Oracle won't reclaim the server for being "idle". Set a **budget alert of $1** to be safe.
3. **Compute → Instances → Create instance:** image **Ubuntu 24.04**, shape **VM.Standard.A1.Flex (1 OCPU, 6 GB)** or **VM.Standard.E2.1.Micro**. Both are labelled "Always Free eligible". Keep "Generate SSH key" selected and download the private key.
4. Open the instance and click **Cloud Shell** at the top of the Oracle console (or use SSH), connect to the server, and run:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/prasant793001-stack/What-am-i-now-android/main/whatsapp-bot/setup-server.sh | bash -s -- 971501234567
   ```
   Replace the number with the bot's WhatsApp number. This installs everything and makes the bot start by itself after any reboot.
5. Run `journalctl -u roster-bot -f`, wait for the **pairing code**, and type it into WhatsApp (see *First start*, step 3).
6. Later updates: `bash ~/roster/whatsapp-bot/update.sh`.

### First start

1. Open `whatsapp-bot/config.json` and set:
   - `"botNumber"`: the WhatsApp number to link, country code first, digits only, e.g. `"971501234567"`.
   - `"timezone"`: already `"Asia/Dubai"`.
   - `"leadMinutes"`: `null` uses the roster's "Alert before each role change" setting, or put a number such as `3`.
2. Check it works without WhatsApp:
   ```bash
   npm run demo           # sample messages with a made-up team
   npm run preview -- Prashant   # today's real messages for one person
   ```
3. Start it:
   ```bash
   npm start
   ```
   It prints a **pairing code** such as `ABCD-1234`. On the phone with the bot number open **WhatsApp → Settings → Linked devices → Link a device → Link with phone number instead** and type the code. (Leave `botNumber` empty to get a QR code to scan instead.)
4. You'll see `WhatsApp connected`. The login is saved in `whatsapp-bot/data/`, so next time it connects by itself.
5. On the website: **Settings → WhatsApp alerts →** type the bot's number. Everyone now sees a **Get alerts on WhatsApp** button.

### How colleagues join

They tap **Get alerts on WhatsApp** on the website. WhatsApp opens with `START Prashant` (their name) already typed, and they press Send. They can also type these to the bot at any time:

| Message | What happens |
|---|---|
| `START Name` | Start alerts for that roster name |
| `NOW` | Replies with their current role and the next one |
| `STOP` | Stops their alerts |
| `HELP` | Lists the commands |

Phone numbers are stored **only** on the bot device, in `whatsapp-bot/data/subscribers.json`, never in Firebase. `.gitignore` keeps that folder off GitHub. Don't upload it.

### Good to know

- **Volume:** with 9 people, each gets roughly one message per role slot, about 18 a day, or about 160 a day for the whole team.
- **Restarts:** the bot remembers what it has sent and never sends twice. If it was off when a message was due, that message is skipped rather than sent late.
- **Roster names:** `START` must match the name on the roster. If a name is changed in Settings, that person sends `START NewName` again.
- **"Unlinked" message:** delete the `whatsapp-bot/data/auth` folder and run `npm start` again to re-link.
- **Updating:** after changing the website on GitHub, run `git pull` on the bot device and restart it.
