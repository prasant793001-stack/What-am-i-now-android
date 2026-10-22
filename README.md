# What Am I Now? (website only)

A plain website: one `index.html` and a few small files. It has no build step, no Android or iPhone app and no npm. The shared roster data stays in your existing Firebase project, so nothing your team has saved is lost.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole app: roster, sick leave, spin wheel, avatars, alerts, Google Calendar |
| `firebase-config.js` | Your Firebase keys (copy your filled-in one over this) |
| `firestore.rules` | Database rules (paste into Firebase → Firestore → Rules) |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Let phones "Add to Home Screen" and show pop-up notifications |

## Put it online (free, GitHub Pages)

1. Copy your old filled-in `firebase-config.js` over the one here.
2. Upload these files to the root of a GitHub repository (public).
3. Open the repository's **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**.
4. After about a minute the site is live at `https://YOUR-USERNAME.github.io/REPO-NAME/`.
5. In Firebase go to **Authentication → Settings → Authorized domains** and add `YOUR-USERNAME.github.io` if it isn't listed already.

## On phones

Open the site and use **Share → Add to Home Screen** (iPhone) or **⋮ → Add to Home screen** (Android). It then opens like an app.

**Alerts:** the in-page chime and pop-up work while the site is open. For alerts with the phone locked, each person can use **Add to Google Calendar** or the **iPhone / Outlook calendar file** button. WhatsApp notifications are planned as the next step.

## What was removed

- The `android/` and `ios/` folders, Capacitor and `package.json`
- `vendor/` scripts and the native alarm code inside `index.html`
- `roster-team.keystore`: delete it from your old GitHub repo too, since it was the signing key for the Android APK
