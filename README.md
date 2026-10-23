# What Am I Now? v1.1.0

A simple team roster website. Open it and you see straight away:

- **Current role:** what you're doing now, from what time to what time
- **Next role:** what's next, from what time to what time
- **Roster:** the whole day's sheet. It always fits the screen, with no scrolling sideways.
- **Spin** or **Scratch:** pick your starting role for next week. Once picked, it's fixed.
- **Settings:** change user, team, roles, shifts, alerts
- **WhatsApp alerts:** each person gets *their own* role on WhatsApp a few minutes before every change

## Files

| File / folder | What it is |
|---|---|
| `index.html` | The website |
| `roster-engine.js` | Works out who does which role when |
| `firebase-config.js` | Keys for the shared team database (see below) |
| `firestore.rules` | Database rules |
| `images/` | Agent photos: `images/Name.jpg`. See `images/AGENTS.txt` |
| `whatsapp-bot/` | The WhatsApp bot (bot number set in `whatsapp-bot/config.json`: 971505353447) |
| `Start WhatsApp bot.bat` | **Double-click to run the WhatsApp bot on a Windows PC** |
| `Publish to GitHub.bat` | **Double-click to upload all your changes to GitHub** |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | "Add to Home Screen" and pop-up alerts |

## How the site remembers things

| What | Where it's kept | Who sees it |
|---|---|---|
| **Who you are** | Saved on each device the first time you tap your name: browser storage, a cookie and `?me=Name` in the address. Change it in **Settings → Change user**. | Only that device |
| **Spin / Scratch picks, sick leave, team, roles, shifts** | The shared team database (Firebase) | Everyone, instantly |

Each pick is saved with a database transaction, so two people can never get the same spot, and once it's saved it can't be changed.

**Until Firebase is set up, the site runs in Demo mode.** Everything works, but it's saved only on that one device, so colleagues won't see each other's picks or sick leave. The footer says "Demo mode" while this is the case.

To share it with the team (free, no card needed), create a Firebase project and paste its keys into `firebase-config.js`:
1. https://console.firebase.google.com → **Create a project**.
2. **Firestore Database → Create database** (production mode) → **Rules** → paste `firestore.rules` → Publish.
3. **Authentication → Sign-in method → Anonymous → Enable.**
4. **Project settings → Your apps → Web `</>`** → copy the config values into `firebase-config.js`.
5. **Authentication → Settings → Authorized domains** → add `prasant793001-stack.github.io`.

## Photos

Replace each file in `images/` with the real photo, **keeping the same name** (e.g. `images/Ahmed.jpg`). Names must match the roster exactly, including capital letters. Square photos look best. If a photo file is missing, the person's initials show instead.

## Publish to GitHub (one click)

Double-click **`Publish to GitHub.bat`** in this folder. It uploads everything you changed, and the website updates about a minute later.

- First time only: if Git isn't installed it installs it (then double-click again), and a GitHub sign-in window opens once.
- Use this folder as your working copy. The first publish makes GitHub match this folder.

## Website address

GitHub repository → **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save.**
The site: **https://prasant793001-stack.github.io/What-am-i-now-android/**
On phones: **Add to Home Screen** so it opens like an app.

## WhatsApp alerts

The bot sends from **+971 50 535 3447**. Colleagues join by tapping **Get alerts on WhatsApp** on the Home page. WhatsApp opens with `START Name` typed, and they press Send. `NOW` gives their current role and `STOP` turns alerts off.

**Needs:**
1. **Firebase set up** (see above). The bot reads the shared roster; in Demo mode it can't see it.
2. **Something running the bot during shifts.** Choose one:
   - **A Windows PC:** double-click `Start WhatsApp bot.bat`. It installs what it needs the first time and can start itself with Windows. The PC must be on (screen can be off) during shift hours.
   - **A free Oracle Cloud server** (always on, needs a card to verify): run `bash whatsapp-bot/setup-server.sh 971505353447` on it.
3. **Link the number once:** the first start shows a pairing code. On the phone with WhatsApp for 0505353447: **Settings → Linked devices → Link a device → Link with phone number instead**, then type the code. That phone doesn't have to stay on, but should open WhatsApp at least every 2 weeks.

It's not an official WhatsApp tool, so there's a small risk WhatsApp blocks the number. Colleagues messaging START first, and saving the number as a contact, keeps the risk low.
