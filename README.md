# What Am I Now? (website + Telegram alerts)

1. **The website.** Plain files with no app stores and no build step. Hosted free on GitHub Pages, with data in Firebase.
2. **Telegram alerts.** A few minutes before every role change, each person gets **their own** role on Telegram, even with the phone locked:

```
⏰ Prashant, in 3 min it's your GREETER time
🕑 2:00–3:00 PM
↪️ Moving from SAS1 · next: TAB1 at 3:00 PM
```

The alerts run on Cloudflare's free plan, so no PC, phone or server has to stay on, and no card is needed. Sick leave, wheel spins and settings changes are used automatically. People on leave and days off get no messages.

---

## Files

| File | What it is |
|---|---|
| `index.html` | The website: roster, sick leave, spin wheel, avatars, alerts, Google Calendar |
| `roster-engine.js` | The roster calculation, shared by the website and the Telegram alerts so they always agree |
| `firebase-config.js` | Your Firebase keys |
| `firestore.rules` | Database rules |
| `telegram-bot/` | The Telegram alerts (Cloudflare Worker) |
| `.github/workflows/telegram-bot.yml` | Puts the Telegram alerts online automatically when you push to GitHub |

---

## 1. Firebase (the shared database)

1. https://console.firebase.google.com → **Create a project** (Google Analytics not needed).
2. **Build → Firestore Database → Create database** → location `eur3` or the nearest one → **production mode**.
3. **Firestore → Rules:** paste `firestore.rules` → **Publish**.
4. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable.**
5. **Project settings → Your apps → Web (`</>`)** → register the app → copy the `firebaseConfig` values into `firebase-config.js`.
6. **Authentication → Settings → Authorized domains** → add `YOUR-USERNAME.github.io`.

## 2. Website (GitHub Pages)

Repository **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save.**
It goes live at `https://YOUR-USERNAME.github.io/REPO-NAME/`. On phones use **Add to Home Screen**.

## 3. Telegram alerts (about 10 minutes, once)

**a. Create the bot.** In Telegram open **@BotFather** → `/newbot` → choose a name (e.g. *What Am I Now Roster*) and a username ending in `bot` (e.g. `WhatAmINowRosterBot`). BotFather replies with a **token** like `123456:ABC...`. Keep it private.

**b. Free Cloudflare account.** Sign up at https://dash.cloudflare.com/sign-up (no card). Open **Workers & Pages** once so Cloudflare sets up your free `workers.dev` address.
Then go to **My Profile → API Tokens → Create Token → template "Edit Cloudflare Workers" → Account Resources: your account → Continue → Create Token**, and copy the token.

**c. Give both tokens to GitHub.** In the repository: **Settings → Secrets and variables → Actions → New repository secret**:
- `TELEGRAM_BOT_TOKEN`: the BotFather token
- `CLOUDFLARE_API_TOKEN`: the Cloudflare token

**d. Deploy.** Open **Actions → Deploy Telegram alerts → Run workflow**. When it turns green, the alerts are live. Every later push to GitHub updates them by itself.

**e. Switch on the button.** On the website: **Settings → Telegram alerts →** type the bot username (e.g. `WhatAmINowRosterBot`).

## How colleagues join

They tap **Get alerts on Telegram** on the website, and Telegram opens. They press **Start** and they're in. In the bot they can send:

| Message | What happens |
|---|---|
| `/start` | Shows name buttons. Tap yours to join |
| `/now` | Their role right now and the next one |
| `/stop` | Turns their alerts off |

## Good to know

- **Timing:** messages go out at the **Alert before each role change** time from the website Settings (default 3 minutes). To change it for Telegram only, set `LEAD_MINUTES` in `telegram-bot/wrangler.toml`.
- **Time zone:** Dubai time (UTC+4) is set in `TZ_OFFSET_MINUTES` in `telegram-bot/wrangler.toml`.
- **Free limits:** Cloudflare runs the check once a minute, using about 1,500 of its 100,000 free daily runs. Firebase reads stay well inside the free 50,000 a day.
- **Changes on the website** (sick leave, settings) reach the alerts within a minute. Spin-wheel results are re-read every 30 minutes.
- **Check it's alive:** open the worker address shown at the end of the GitHub Action run (`https://what-am-i-now-telegram.<you>.workers.dev`). It shows how many people have joined.
- **Telegram chat IDs** (not phone numbers) are kept in Cloudflare, not in Firebase.
