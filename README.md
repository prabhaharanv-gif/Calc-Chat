# Calc Chat

A private 1:1 chat hidden behind a **2048 game** (or a calculator).

## How it works
- **No registration.** First launch: choose your name, a 4-8 digit passcode (stored only on the device, hashed) and the front screen (**Game 2048** or **Calculator**).
- **Game mode:** play 2048 normally. Hold the **2048 title for 3 seconds** and a hidden PIN pad appears; enter your passcode to open the chat.
- **Calculator mode:** type the passcode and press `=`.
- Every device has its own **8-character code**. A friend enters it under "Join a friend" and the two of you share a private chat (max 2 people).
- **End-to-end encrypted:** each device has an ECDH P-256 key pair. The two devices derive a shared AES-256-GCM key (HKDF, salted with the chat code). Text, photos, voice, video and file names are encrypted on the phone; the server only relays ciphertext. A **safety number** (tap the chat title) can be compared with your friend to detect a man-in-the-middle.
- **Clear chat** (trash icon) wipes it for both people. **Delete** removes one of your messages for both. Reply, edit (own text) and emoji reactions are supported.
- Messages, photos, voice notes and videos are **auto-deleted after 4 hours**, on both devices. They exist only in server RAM (as ciphertext) and in the open app's memory. Nothing is written to disk or a database.
- **3 wrong passcodes** wipe every chat this device is part of (retried automatically if the phone was offline).
- **Screenshots/recording are blocked** in the Android release build (`FLAG_SECURE`). Debug builds allow screenshots on purpose. In a browser this cannot be enforced, only discouraged.

## Run locally
```powershell
cd server; npm install; npm start          # http://localhost:4000 (also serves client/dist)
cd client; npm install; npm run build      # or: npm run dev -> http://localhost:5173
```
Tests: `cd server; node test.mjs` (spins up its own server), `cd client; node e2e-test.mjs; node game-test.mjs; node sha-test.mjs`.

Encryption needs a secure context: `https://` or `http://localhost` (the Android app counts as secure). Plain `http://192.168.x.x` links will not work.

## Deploy (so anyone on any network can use it)
Needs HTTPS. Push this folder to GitHub and create a web service (see `render.yaml`; any Node host works). Run exactly **one** instance: messages live in RAM.

## Android app
```powershell
cd client
$env:VITE_SERVER_URL="https://YOUR-SERVER-URL"; npm run build
npx cap sync android
cd android; .\gradlew.bat assembleDebug     # debug APK (screenshots allowed)
```
For Play Store build a signed release AAB in Android Studio (screenshots blocked). Replace the launcher icon (`android/app/src/main/res/mipmap-*`) with a 2048-style icon.

## Play Store checklist
- Google Play developer account ($25 one-time). New personal accounts must run a closed test with 12+ testers for 14 days before production.
- Privacy policy URL (draft in `docs/PRIVACY.md`).
- Data safety form: messages/media are end-to-end encrypted, held in RAM and deleted within 4 hours; no accounts; no ads; no analytics.
- **The store listing must clearly say the app is a private chat hidden behind a game** (draft in `docs/STORE_LISTING.md`). Hiding this is a "deceptive behavior" policy violation.
- Content rating questionnaire: user-to-user communication = yes. Provide a way to report abuse (support email).

## Known limits
- Server restart or redeploy clears all active chats (by design: no storage).
- The server still sees metadata: who is in a room, message sizes/times/types, reactions, display names. It cannot read message content.
- If someone reinstalls the app they get a new key pair; messages encrypted for the old key cannot be read.
- Nobody can stop another phone/camera from photographing the screen.
- The calculator's 3-strikes counter treats a hand-typed digits-only entry of passcode length as an attempt.
