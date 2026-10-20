# What Am I Now? (website + Android app + iPhone app)

One folder makes all three:

- **Website**: published to GitHub Pages automatically.
- **Android app**: built by GitHub automatically. Agents download one APK file.
- **iPhone app**: built on a Mac (or a cloud Mac) and shared through Apple's TestFlight.

The apps schedule each role-change alarm on the phone itself, 3 minutes before the change. **They ring even when the app is closed and the phone is locked.** Each time the app is opened it re-reads the roster (sick leave, wheel spins, settings) and reschedules.

---

## 1. Firebase (skip if already done)

Do steps 1–6 of the Firebase setup from the website README: create the project, Firestore, the rules from `firestore.rules`, and Anonymous sign-in.
Put your Firebase values into **`www/firebase-config.js`**. If you already filled in `firebase-config.js` for the website, copy that file over this one.

## 2. Put this folder on GitHub

Easiest is **GitHub Desktop** (https://desktop.github.com): *File → Add local repository* → choose this folder → *Publish repository* (untick "Keep this code private" if you want the free website).

Using the website instead? *Add file → Upload files* and drag in **everything**, including the hidden **`.github`** folder. On a Mac press `Cmd+Shift+.` in Finder to see it. GitHub takes at most 100 files per upload, so upload the `android` folder first, commit, then upload everything else.

Then, in the repository on github.com:

1. **Settings → Pages → Source: GitHub Actions.** The website goes live at `https://YOUR-USERNAME.github.io/REPO-NAME/`.
2. **Settings → Actions → General → Workflow permissions → Read and write permissions → Save.**
3. Open the **Actions** tab. If it asks, click **"I understand my workflows, go ahead and enable them"**, then run **Build Android app** and **Publish website** once (*Run workflow*).

If the old website repo is still in use, either point the team to this new address or keep the old one. Both use the same Firebase data.

## 3. Android: install

1. When **Build Android app** turns green (about 5 minutes), open **Releases → "What Am I Now? for Android"** on the repo's main page.
2. On each Android phone, open that page in Chrome and tap **WhatAmINow.apk**. Allow *"Install unknown apps"* for Chrome when asked, then **Install**.
3. Open the app, tap your character, and tap **Allow** for notifications.
4. Tap **Test alarm in 10 seconds** and lock the phone to check it rings.

**Important on Samsung, Xiaomi, Oppo, Huawei:** Settings → Apps → What Am I Now? → Battery → **Unrestricted**. Otherwise the phone may delay alarms to save battery.

**Updates:** every upload to GitHub builds a new APK. Download and install it over the old one. Nothing is lost.

## 4. iPhone: install (needs an Apple Developer account)

Apple only lets apps onto iPhones through its own system:

- **Apple Developer Program: $99 per year** (https://developer.apple.com/programs). It lets you share the app with up to 10,000 people through **TestFlight**. There's no App Store review for internal testers.
- **A Mac with Xcode** (free from the Mac App Store). No Mac? A cloud Mac service such as **Codemagic** (free tier) can build and send it to TestFlight from this GitHub repo.

On the Mac:

```bash
npm install
npx cap sync ios
cd ios/App && pod install && cd ../..
npx cap open ios
```

In Xcode:

1. Select **App** in the left panel → **Signing & Capabilities** → Team: your developer account. If `com.whataminow.roster` is taken, change the Bundle Identifier to something unique, e.g. `com.yourname.whataminow`.
2. Top bar: choose **Any iOS Device** → menu **Product → Archive** → **Distribute App → TestFlight & App Store → Upload**.
3. In https://appstoreconnect.apple.com → your app → **TestFlight** → **Internal Testing** → add agents by email (they must be added under *Users and Access* first) or use **External Testing** with a public link (needs a quick Apple beta review, usually within a day).
4. Agents install **TestFlight** from the App Store, open the invite, and install **What Am I Now?**.

TestFlight builds expire after **90 days**, so upload a new build every couple of months.

**No Apple account?** The website's **Add to Google Calendar** button gives iPhone users locked-screen reminders for free.

---

## How the alarms behave

| | Android app | iPhone app |
|---|---|---|
| Rings with app closed / phone locked | Yes | Yes |
| Alarms scheduled ahead | Next 14 days | Next ~3 days (Apple allows 64 at a time) |
| Phone on silent / Do Not Disturb | Follows the phone's settings | Vibrates only when the ring switch is on silent |
| Sound | 6-second chime | 6-second chime |

**When the roster changes** (someone marked sick, wheel spun, settings changed), each phone picks up the new times **the next time the app is opened**. Ask agents to open the app at the start of each shift. iPhone users need to open it at least every 3 days to keep alarms topped up.

## Updating the app after website changes

All app screens come from the `www` folder. Change `www/index.html`, upload it to GitHub, and:

- the website updates by itself,
- a new Android APK is built by itself,
- for iPhone, run `npx cap sync ios` on the Mac and Archive again.

## Files

- `www/`: the website and app screens (`index.html`, `firebase-config.js`).
- `android/`, `ios/`: the native app projects, with alarm sound, icons and permissions already set up.
- `.github/workflows/`: the automatic website and Android builds.
- `android/app/roster-team.keystore`: the app's signing key. Keep it in the repo so every update installs over the old version.
