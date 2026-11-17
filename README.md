# Calc Chat

A private 1:1 chat that looks like a calculator.

## How it works
- **No registration.** First launch: choose a 4-8 digit passcode (stored only on the device, hashed).
- Type the passcode in the calculator and press `=` to open the app.
- Every device has its own **8-character code**. A friend enters it under "Join a friend" and the two of you share a private chat (max 2 people).
- **Clear chat** (🗑) wipes it for both people.
- Messages, photos, voice notes and videos are **auto-deleted after 4 hours**. They exist only in server RAM and in the open app's memory. Nothing is written to disk or a database.
- **3 wrong passcodes** wipe every chat this device is part of (retried automatically if the phone was offline).
- **Screenshots/recording are blocked** in the Android app (`FLAG_SECURE`). In a browser this cannot be enforced, only discouraged.

## Run locally
```powershell
cd server; npm install; npm start          # http://localhost:4000
cd client; npm install; npm run dev        # http://localhost:5173 (use this one)
```
Tests: `cd server; node test.mjs` (spins up its own server) and `cd client; node sha-test.mjs`.

## Deploy (so anyone on any network can use it)
Needs HTTPS (voice recording and Android WebView require it). Easiest: push this folder to GitHub and create a **Render** web service from `render.yaml` (use a paid always-on instance: free instances sleep and lose RAM). Run exactly **one** instance.

## Android app
```powershell
cd client
$env:VITE_SERVER_URL="https://YOUR-SERVER-URL"; npm run build
npx cap sync android
npx cap open android        # opens Android Studio -> Build > Generate Signed Bundle (AAB)
```
Replace the launcher icon (`android/app/src/main/res/mipmap-*`) with a calculator icon.

## Play Store checklist
- Google Play developer account ($25 one-time). New personal accounts must run a closed test with 12+ testers for 14 days before production.
- Privacy policy URL (draft in `docs/PRIVACY.md`, host it on any public page).
- Data safety form: messages/media are processed in transit and deleted within 4 hours; no accounts; no ads; no analytics.
- **Store listing must clearly say the app is a private chat disguised as a calculator** (draft in `docs/STORE_LISTING.md`). Hiding this is a "deceptive behavior" policy violation and gets apps removed.
- Content rating questionnaire: user-to-user communication = yes.
- Add a way to report abuse (e.g. a support email in the listing) since it is a user-generated-content app.

## Known limits
- Server restart or redeploy clears all active chats (by design: no storage).
- Not end-to-end encrypted: content passes through the server over HTTPS and is held in RAM until expiry. Adding E2E (keys derived from the chat code) is a possible next step.
- Nobody can stop another phone/camera from photographing the screen.
- The 3-strikes counter treats a hand-typed digits-only entry with the same length as the passcode as an attempt.
