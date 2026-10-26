# What Am I Now? v1.7.0

Shown to the team as **Al Ain BC** (black and purple BC logo, also the name on phone home screens). The repository, website address and Firebase project keep their old names.

A simple team roster website. Open it and you see straight away:

- **Current role:** what you're doing now, from what time to what time
- **Next role:** what's next, from what time to what time
- **On the floor now:** four boxes on Home showing who is Greeter, Greeter Assistant (GA), SAS 1 and TAB 1 right now, until when, and who's next
- **Routine** (the Roster page): the whole day's sheet. It always fits the screen, with no scrolling sideways. Today's finished time slots drop off the top as the day goes on (tap **Show finished** to see them again).
- **Download:** the whole week (7 days, every time slot) as a **PDF** to keep or share, or as **Excel (CSV)**. On the Routine page, under the sheet.
- **Managers:** a view-only profile that shows what everyone is doing right now, the full roster and the download, without being on the roster
- **Next Week Luck:** pick your starting role for next week by spinning the wheel or scratching a card. Once picked, it's fixed.
- **Tools** (the round button at the bottom right): your **QR code**, **RQMS** and **Translator** links, the **Weekly Assessment** check and **Zero Club**.
- **My profile:** tap your picture at the top to change your name, your photo, write a short line about yourself, pick a style or colour for the whole site, or change user. Tap **Save**.
- **Settings:** your device and alerts for everyone; team, role sequence, shifts, half days, Saturday, managers, photos, tools, QR codes and **Push to GitHub** for the **admin** only. Every change shows straight away as a preview; one **Save changes** at the bottom sends it all to the team.
- **WhatsApp alerts:** each person gets *their own* role on WhatsApp a few minutes before every change (join from Settings → Alerts)
- **Phone notifications:** a notification on Android or iPhone a few minutes before every change, even with the site closed (one-time setup below)

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
| `sw.js`, `manifest.webmanifest`, `icon-*.png`, `badge-96.png` | "Add to Home Screen", pop-up alerts and phone notifications |
| `push-server/worker.js` | The free notification server for phone notifications (paste into Cloudflare, see below) |
| `version.json` | The current version number. Open copies of the site check it and update themselves (see below) |
| `vendor/` | The PDF maker used by Download (jsPDF, MIT licence). Loads only when someone taps PDF |

## How the roster rotates

- **Role sequence** (Settings → Role sequence): each time slot everyone moves one step down the list, and the last role goes back to the top, e.g. Greeter → Break → TAB3 → … → SAS1 → Greeter. The Routine shows the roles left to right in the same order, so each time slot you move one column to the right. The admin changes the sequence by dragging ☰ or with ↑ ↓ (for example, to make GA come right after Greeter, drag GA to number 2). Settings spells out the result: how people move, which roles are left empty first when people are missing, and which roles are added when there are more people.
- **Next day** the order moves up by one, so it carries straight on: yesterday's Greeter starts the day on the role after Greeter in the sequence.
- **Half days** (Settings → Half days): one shift only on those days. **Every Friday is 8:00–12:00**, one table instead of two. The admin can change the times or add other half days.
- **Saturday** (Settings → Saturday): by default Hamada and Ahoud are off, and TAB3, SAS3 and Break are not used. Change who is off and which roles are dropped there. Settings → Saturday shows how the numbers work out.
- **More people than roles:** the extras get working roles, never "Break 2". Roles left out that day come back first (TAB3, then SAS3), then new ones are added: TAB4, SAS4, TAB5… So on a Saturday with one person more than roles, they get TAB3; on a weekday with one person more than the 9 roles, they get TAB4.
- **Standby is never used**, in the roster or in Next Week Luck.

## Who can change what

- **Everyone:** their own name, photo, About me and theme (tap your picture), Change user, their weekly pick in **Next Week Luck**, and their own Weekly Assessment and Zero Club ticks. Phone notifications and alerts on their own device.
- **Admin only:** everything else: **leave** (Routine → tap a name), the team and its order, the role sequence, managers, Saturday, shifts, half days, working days, alert time, the weekly pick window, photos for others, QR codes, the tool links and the Zero Club list, and Push to GitHub.

## Next Week Luck

One tab for the weekly pick. When it's open, tapping **Next Week Luck** asks **How do you want to play?**
- **Spin the wheel:** one tap spins it and it lands on your role.
- **Scratch a card:** there is one card for each role still open (9 at the start; if 5 people have played, 4 cards). Pick a card and scratch it.

Both are the same fair draw with the same rules. After you've played, the page shows the game you played, your role for next week and everyone's picks so far.

## Tools (button at the bottom right)

- **My QR code:** each person sees only their own (also in their profile: tap your picture → My QR code). Until the admin adds it, a placeholder shows. Admin: **Settings → QR codes** → **Add** / **Change** / **Remove** for each person (a photo or screenshot of the QR is fine). Saved straight away.
- **RQMS** and **Translator:** open the links the admin puts in **Settings → Tools**. Until then they say "Link not added yet".
- **Weekly Assessment:** each person marks it done for the week. The dot next to your name at the top is **red** until you do and **green** after. It goes back to red every Monday. The admin can rename it and add a link (Settings → Tools), and sees who has done it (Settings → This week).
- **Zero Club:** a checklist the admin writes (Settings → Tools → add and remove items). Each person ticks what they've done. It starts fresh every Monday (or every month, or never: the admin chooses).

## Fixed days

Once a working day starts, its roster is **fixed**: who works, in which order, the roles and the shift times are saved for that day (the Routine page shows 🔒 Fixed). After that, settings changes, new team members and wheel picks only change days that haven't started yet. **Leave marked by the admin is the only thing that still changes a fixed day**: the person comes off and the others move up, as before.

- The first copy of the site that's open after midnight saves the day. If nobody opens it, it's saved the next time someone does (the past week too).
- If the admin saved the wrong settings and today is already fixed: **Settings → Admin → Rebuild today from settings** (tap twice). Today then follows the current settings and stays fixed for the rest of the day.
- The WhatsApp bot reads the same fixed days, once it is updated (see "After updating the website, update the bot too" below).

## Changing your name

Tap your picture → **Name** → type the new name → **Save**. Everyone sees the new name at once: roster, Home, Next Week Luck, downloads, the WhatsApp bot and phone notifications. Leave, picks and fixed days saved under the old name stay with you, your photo and theme move with you, and your other phones and PCs switch to the new name by themselves. A name already used by someone else on the team can't be taken.

## Admin

Leave and team settings (team order, roles, managers, Saturday, shifts, alert time, WhatsApp number, weekly pick) can only be changed by the admin.

- **Sign in:** tap your profile picture at the top **5 times quickly**, then enter the admin password (capitals and spaces don't matter). The password isn't written in this README because the repository is public. An **ADMIN** badge shows next to your name.
- **Sign out of admin:** tap the **ADMIN** badge (or your picture 5 times) → **Sign out of admin**, or Settings → Admin → **Sign out of admin**.
- **Leave:** Routine → pick the day → tap a name to mark leave (tap again to undo). It saves for everyone straight away; no Save needed.
- **Change, check, then save once:** everything you add, remove or move in Settings shows straight away on your device, everywhere in the site (new managers, photos, roles, the routine), so you can check it looks right. A bar says "Preview · not saved yet". Nobody else sees the changes, and phone notifications don't use them, until you tap **Save changes** at the bottom. **Discard** throws them all away.
- **Photos for everyone:** in Settings → Team (and Managers), tap a person's picture to choose their photo. It shows straight away and is saved with **Save changes**.
- This is a light lock to stop casual changes. It isn't strong security: the roster database is still open to anyone with the website.

## Profiles and themes

Tap your picture (top right, or on Home) once. You can change your **name** (see Changing your name), add or change your **photo** (it's cropped square and saved for the team), write **About me** (up to 120 characters, shown on Home and the "Who are you?" screen), choose how the whole site looks for you, or **Change user**. The look previews straight away; **Save** keeps it, **Cancel** goes back. It follows you to any device where you choose your name, and only changes the site for you.

- **Styles** (a complete look with its own background): **Boys** (navy and electric blue), **Ladies** (blush and plum), **Managers** (navy and gold; managers start with this), **Fun** (bright and playful), **Punchy** (black and neon), **Luxury** (black and gold), **Cute** (pastel pink and mint), **Lovely** (rose and peach), **Empowering** (indigo and flame).
- **Colours** (recolour the whole site and follow **Light / Dark / Auto**): BC Purple (the default), Teal, Ocean, Lagoon, Emerald, Gold, Sunset, Crimson, Rose, Graphite.

A photo set here takes the place of `images/Name.jpg`; remove it to go back to the file.

## Managers (view only)

The admin adds or removes managers in **Settings → Managers**. Managers then pick their name on the "Who are you?" screen, under the team, and use their own profile to follow the team. Saving settings only writes what changed, so the managers list can't be wiped by a phone with an old copy of the settings.

Managers get three pages: **Team now** (everyone's role right now and their next one, updating by itself), **Routine** (the full sheet for any day), and **Settings** (change user). They have a profile too (photo, about, theme, QR code) and the Tools button. They can change their own name, photo and theme and download the week, but can't mark leave, play Next Week Luck or change team settings. They don't count as part of the roster.

## How the site remembers things

| What | Where it's kept | Who sees it |
|---|---|---|
| **Who you are** | Saved on each device the first time you tap your name: browser storage, a cookie and `?me=Name` in the address. Change it in **Settings → Change user**. | Only that device |
| **Next Week Luck picks, leave, fixed days, team, roles, shifts, tools** | The shared team database (Firebase). Leave and the fixed day are kept together in `absences/<date>`; QR codes in `config/qr-<name>`; Weekly Assessment and Zero Club ticks in each person's profile | Everyone, instantly |

Each pick is saved with a database transaction, so two people can never get the same spot, and once it's saved it can't be changed.

**Until Firebase is set up, the site runs in Demo mode.** Everything works, but it's saved only on that one device, so colleagues won't see each other's picks or sick leave. The footer says "Demo mode" while this is the case.

To share it with the team (free, no card needed), create a Firebase project and paste its keys into `firebase-config.js`:
1. https://console.firebase.google.com → **Create a project**.
2. **Firestore Database → Create database** (production mode) → **Rules** → paste `firestore.rules` → Publish.
3. **Authentication → Sign-in method → Anonymous → Enable.**
4. **Project settings → Your apps → Web `</>`** → copy the config values into `firebase-config.js`.
5. **Authentication → Settings → Authorized domains** → add `prasant793001-stack.github.io`.

## Photos

The easiest way: everyone taps their picture in the app and adds a photo, or the admin adds them for everyone in **Settings → Team** and taps **Save changes** (then **Push to GitHub** to keep copies here). Or replace each file in `images/` with the real photo, **keeping the same name** (e.g. `images/Ahmed.jpg`). Names must match the roster exactly, including capital letters. Square photos look best. If a photo file is missing, the person's initials show instead.

## Push to GitHub from the app (admin)

After adding photos in Settings, the admin can send them to GitHub straight from the app: **Settings → Push to GitHub**. It puts everyone's photo into `images/` (as `images/Name.jpg`) and a backup of the team settings into `backup/team-settings.json`, in one commit. Only changed files are sent; the website updates about a minute later. If there are unsaved changes, the button says **Save & push** and does both.

It needs a GitHub token once per device (kept only on that device, never in the team database):
1. On github.com: your picture → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Name it (e.g. "Al Ain BC app"), pick an expiry, **Repository access → Only select repositories → What-am-i-now-android**.
3. **Permissions → Repository permissions → Contents → Read and write**. **Generate token** and copy it.
4. In the app: Settings → Push to GitHub → paste it in **GitHub token** → **Push to GitHub**.

Use it only on your own phone or PC, and tap **Forget token** on any other device. Photos don't need GitHub to show: they appear for the team as soon as you tap **Save changes**.

## Publish to GitHub from a PC folder (one click)

Double-click **`Publish to GitHub.bat`** in this folder. It uploads everything you changed, and the website updates about a minute later.

- First time only: if Git isn't installed it installs it (then double-click again), and a GitHub sign-in window opens once.
- Use this folder as your working copy. The first publish makes GitHub match this folder.
- It refuses to publish an incomplete or old folder (for example the old app folder with `www` and `android` inside), because that would replace the live website.

## Phone notifications (Android + iPhone)

A website can't wake a closed phone by itself. A tiny free server does that: it runs every minute on **Cloudflare Workers** (free plan, no card), reads the roster plan the website keeps in Firebase, and sends each phone a notification a few minutes before its next role (Settings → "Alert and notification before each role change": 3, 4 or 5 minutes). It works next to the WhatsApp alerts; people can use either or both.

You set it up once, in about 15 minutes. No Firestore rules change is needed.

**A. Firebase key for the server**
1. Firebase console (project **who-am-i-now**) → ⚙ **Project settings** → **Service accounts** → **Generate new private key** → **Generate key**. A `.json` file downloads.
2. Keep it private. **Never put it in this folder or on GitHub.** You paste it into Cloudflare in step B5.

**B. The notification server**
1. Sign up free at https://dash.cloudflare.com.
2. **Workers & Pages** (newer menus: **Compute → Workers & Pages**) → **Create** → **Create Worker** / **Start with Hello World** → name it `what-am-i-now-push` → **Deploy**.
3. **Edit code** → delete everything → paste the whole of **`push-server/worker.js`** from this folder → **Deploy**.
4. Open the Worker's address (`https://what-am-i-now-push.YOUR-NAME.workers.dev`). It shows two **push keys**. Keep the page open.
5. Worker → **Settings → Variables and Secrets → Add**, four times:

   | Name | Type | Value |
   |---|---|---|
   | `VAPID_PUBLIC_KEY` | Text | the public key from the page |
   | `VAPID_PRIVATE_KEY` | Secret | the private key from the same page |
   | `VAPID_SUBJECT` | Text | `mailto:prasant793001@gmail.com` (or another email you own) |
   | `FIREBASE_SERVICE_ACCOUNT` | Secret | open the `.json` file from step A in Notepad, copy **all** of it, paste |

6. **Settings → Trigger Events** (or **Triggers**) → **Add** → **Cron Triggers** → `* * * * *` (every minute) → **Add**.
7. Reload the Worker's address. Every line turns ✓ (the "Phones" and "Roster plan" lines once the first phone turns notifications on; "Every-minute run" within 10 minutes). The page works as a health check at any time.

As soon as the keys line shows ✓, the website shows **Turn on notifications** on the Home page.

**C. Each person, once per phone**
- **Android:** open the site in **Chrome** → Home → **Turn on notifications** → **Allow** → **Send a test**, then lock the phone. It arrives within a minute.
- **iPhone (iOS 16.4 or newer):** Apple only allows notifications from sites added to the Home Screen. In **Safari** tap **Share** → **Add to Home Screen** → **Add**. Open **Al Ain BC** from the Home Screen (not Safari; it may still be called *What Am I Now?* if it was added before), tap your name, then **Turn on notifications** → **Allow** → **Send a test**.
- Tapped **Don't Allow** by mistake? iPhone: Settings → Notifications → Al Ain BC → Allow. Android: Chrome ⋮ → Settings → Site settings → Notifications → allow the site.

The website keeps a 14-day notification plan for everyone who turned notifications on, and any open copy of the site updates it within seconds when sick leave, picks or settings change. If nobody opens the site for 14 days, notifications pause until someone does. Notifications follow the phone's Focus / Do Not Disturb settings; on Samsung, Xiaomi, Oppo and Huawei set Chrome's battery use to **Unrestricted**.

## How updates reach everyone

Phones and tills keep the site open for days, so from v1.5.1 every open copy checks `version.json` every 5 minutes and whenever it comes back to the screen. When a newer version is out, it reloads itself at a quiet moment: nothing unsaved, no profile panel open, no spin, scratch or role alert running. Otherwise it shows a **New version ready · Update** button at the top. GitHub can take up to about 10 minutes to hand out a new version, so allow up to 15 minutes in total.

When the website's code changes, raise the number in both `version.json` and `const VERSION` in `index.html`. Photos and the settings backup sent with Push to GitHub don't need a new version.

## Website address

GitHub repository → **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save.**
The site: **https://prasant793001-stack.github.io/What-am-i-now-android/**
On phones: **Add to Home Screen** so it opens like an app.

## WhatsApp alerts

The bot sends from **+971 50 535 3447**. Colleagues join by tapping **Get alerts on WhatsApp** in **Settings → Alerts on this device**. WhatsApp opens with `START Name` typed, and they press Send. `NOW` gives their current role and `STOP` turns alerts off.

**Needs:**
1. **Firebase set up** (see above). The bot reads the shared roster; in Demo mode it can't see it.
2. **Something running the bot during shifts.** Choose one:
   - **The Android phone with WhatsApp (recommended):** install Termux from F-Droid, then run
     `curl -fsSL https://raw.githubusercontent.com/prasant793001-stack/What-am-i-now-android/main/whatsapp-bot/setup-android.sh | bash`.
     Keep the phone on the charger and Wi-Fi. Update later with `~/update-bot.sh`.
   - **A Windows PC:** double-click `Start WhatsApp bot.bat`. It installs what it needs the first time and can start itself with Windows. The PC must be on (screen can be off) during shift hours.
   - **A free Oracle Cloud server** (always on, needs a card to verify): run `bash whatsapp-bot/setup-server.sh 971505353447` on it.
3. **Link the number once:** the first start shows a pairing code. On the phone with WhatsApp for 0505353447: **Settings → Linked devices → Link a device → Link with phone number instead**, then type the code. That phone doesn't have to stay on, but should open WhatsApp at least every 2 weeks.

**After updating the website, update the bot too** so its messages follow the same roster rules: on the Android phone run `~/update-bot.sh`; on a Windows PC, get the latest files into the bot's folder (Publish to GitHub.bat also downloads them), then close and restart `Start WhatsApp bot.bat`.

It's not an official WhatsApp tool, so there's a small risk WhatsApp blocks the number. Colleagues messaging START first, and saving the number as a contact, keeps the risk low.
