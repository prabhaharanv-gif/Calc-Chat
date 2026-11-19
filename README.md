# Gamaroon (private chat inside)

A private 1:1 chat hidden inside a **games app**: a colourful hub with six real games (Snake, 2048, Memory, Tic Tac Toe, Mines, Slide).

## How it works
- **No registration.** First launch: your name and a 4-8 digit passcode (stored only on the device, hashed).
- The front screen is a normal games hub. Play anything. **Hold any game title (or "Gamaroon") for 1-3 seconds, or just tap it if you switched the hold off in Settings** and a hidden PIN pad appears inside the game board; enter your passcode to open the chat. A wrong PIN just shakes, no hint. **3 wrong PINs wipe every chat** this device is part of (retried automatically if the phone was offline).
- Every device has its own **8-character code**. A friend enters it under Join and the two of you share a private chat (max 2 people).
- **End-to-end encrypted:** each device has an ECDH P-256 key pair. The two devices derive a shared AES-256-GCM key (HKDF, salted with the chat code). Text, photos, voice, video and file names are encrypted on the phone; the server only relays ciphertext. A **safety number** (tap the chat title) can be compared with your friend to detect a man-in-the-middle.
- **Secret message signal** (Settings, on by default). A secret app must not show open notifications, so the front screen is the signal: **every game title is maroon when nothing is waiting and turns green when a friend's message is waiting.** It turns maroon again once you open that chat. While the app is open (even locked) it keeps a light "inbox" connection; the server sends only a content-free ping (who + time), and a freshly opened app is told about the newest waiting message. Inside the unlocked area a small in-app banner also appears. There are no system notifications.
- **Clear chat** (trash icon) wipes it for both people. **Delete** removes one of your messages for both. Reply, edit (own text) and emoji reactions are supported.
- Messages, photos, voice notes and videos are **auto-deleted after 30 minutes**, on both devices. They exist only in server RAM (as ciphertext) and in the open app's memory. Nothing is written to disk or a database.
- **Screenshots/recording are blocked** in the Android release build (`FLAG_SECURE`). Debug builds allow screenshots on purpose. In a browser this cannot be enforced, only discouraged.

## Run locally
```powershell
cd server; npm install; npm start          # http://localhost:4000 (also serves client/dist)
cd client; npm install; npm run build      # or: npm run dev -> http://localhost:5173
```
Tests: `cd server; node test.mjs` (spins up its own server), `cd client; node e2e-test.mjs; node game-test.mjs; node games-test.mjs; node snake-test.mjs; node sha-test.mjs`.

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
For Play Store build a signed release AAB in Android Studio (screenshots blocked). Replace the launcher icon (`android/app/src/main/res/mipmap-*`) with a games icon.

## Play Store checklist
- Google Play developer account ($25 one-time). New personal accounts must run a closed test with 12+ testers for 14 days before production.
- Privacy policy URL (draft in `docs/PRIVACY.md`).
- Data safety form: messages/media are end-to-end encrypted, held in RAM and deleted within 30 minutes; no accounts; no ads; no analytics.
- **The store listing must clearly say the app is a private chat hidden inside a games app** (draft in `docs/STORE_LISTING.md`). Hiding this is a "deceptive behavior" policy violation.
- Content rating questionnaire: user-to-user communication = yes. Provide a way to report abuse (support email).

## Known limits
- Server restart or redeploy clears all active chats (by design: no storage).
- The server still sees metadata: who is in a room, message sizes/times/types, reactions, display names. It cannot read message content.
- If someone reinstalls the app they get a new key pair; messages encrypted for the old key cannot be read.
- Nobody can stop another phone/camera from photographing the screen.
