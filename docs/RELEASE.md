# Release checklist (Play Store)

## Build the signed bundle

```powershell
cd client
$env:VITE_SERVER_URL = "https://p01--calc-chat--d8ms72pm8vqv.code.run"   # the Northflank server
npm run build
npx cap sync android
cd android
.\gradlew.bat bundleRelease assembleRelease
```

Outputs: `client/android/app/build/outputs/bundle/release/app-release.aab` (upload this to the Play Console) and
`.../apk/release/app-release.apk` (a signed release build you can install on a phone to test exactly what ships).
Raise `versionCode` in `client/android/app/build.gradle` for every upload (1, 2, 3 ...).

Targets: compileSdk/targetSdk **36** (Google Play requires API 36 for new apps and updates from 31 Aug 2026),
Capacitor 8, AGP 8.13, Gradle 8.14.

## Upload keystore (KEEP IT SAFE)

- File: `release-keys/gamaroon-upload.jks`, settings in `client/android/keystore.properties` (both are git-ignored).
- **Back up both files in two places** (for example a USB stick and a private cloud drive). If they are lost you
  cannot publish updates with this key. Enrol the app in **Play App Signing** (default for new apps): Google keeps the
  real app-signing key and this is only the *upload* key, so a lost upload key can be reset through Play support.
- Never commit the keystore or its passwords.

## Play Console declarations

- **Privacy policy URL**: `https://p01--calc-chat--d8ms72pm8vqv.code.run/privacy`
- **Foreground service: special use** (the app keeps a small encrypted connection open for a generic reminder).
  Suggested wording: "Keeps one small end-to-end-encrypted connection open so the app can show a generic game reminder
  when a friend sends a private message while the app is closed. No message content is read or shown. The user can turn
  it off with the 'Secret signal' switch in Settings." Provide a short screen recording of the switch if asked.
- **Deceptive behaviour**: the listing must say clearly that the app is a private messenger hidden inside a games app
  (see `STORE_LISTING.md`).
- **Data safety**: messages are end-to-end encrypted and held in server memory for at most 30 minutes; no accounts, no
  ads, no analytics. Data in transit is encrypted. Users can delete their data (delete/leave a chat).
- **Permissions**: microphone (voice messages), notifications, foreground service.
- **Content rating**, **target audience** (not for children), **ads**: No.
- A personal developer account must run a **closed test (12 testers, 14 days)** before applying for production.

## Server

Northflank free project, auto-deploy (CD) is OFF: after pushing server changes press **Builds -> Deploy** manually.
See `DEPLOY_NORTHFLANK.md`.
