# Play Console answers (draft to copy from)

Answers are based on how the app really works (see `server/privacy.html`). **You are responsible for what you submit:
read each question and change an answer if something about the app changed.** Where Google's rules leave room for
judgement, the safer option is recommended.

## 1. App access (important for the review)

Choose **All or some functionality is restricted** and paste:

```
The app needs no account or login. The private chat is hidden behind a gesture and a passcode, so please follow these steps:
1. First launch: enter any player name and any 4-8 digit profile code (this code is also the passcode for the chat), then tap "Start playing".
2. On the games screen, press and hold the title "Gamaroon" (or any game title) for 2 seconds. Enter the code you chose. The chat area opens.
   (Settings -> Hold time can be set to "tap" so a single tap opens it. Settings -> Passcode lock can be switched off.)
3. "My chat" shows your personal 8-letter code. To try the chat you need a second device or emulator running the same app:
   on the second device open the chat area, tap the "+" button, enter the first device's code and tap "Join chat". Then open the chat on both devices and exchange messages.
4. Games (Snake, 2048, Memory, Tic Tac Toe, Mines, Slide) are playable from the first screen without any of the above.
```

## 2. Ads

**No**, the app contains no ads.

## 3. Content rating (IARC questionnaire)

- Category: **Game** (or Utility if the form leads you there; answer honestly either way).
- Violence, sexual content, language, controlled substances, gambling: **No** (the games have none).
- **Users can interact / exchange content with each other: Yes** (private one-to-one messages, photos, voice, video, files).
- Shares user location: **No**. Digital purchases: **No**. Unrestricted web access: **No**.
- The rating will show "Users interact". That is expected.

## 4. Target audience and content

- Target age group: **18 and over** (recommended: an end-to-end encrypted, unmoderated messenger; keeps the app out of
  the Families policy). The privacy policy says the app is not directed to children under 13.
- Appeals to children: **No**.

## 5. Data safety form

Google counts data as "collected" when it leaves the device, but two exceptions apply: data that is **only processed
ephemerally** (held in memory and not kept longer than needed to deliver the request) and data sent
**end-to-end encrypted** so that you cannot read it. Messages, media and the display name fit both. The recommended
approach is to **declare them anyway**, marked as ephemeral and encrypted, so the declaration can never be called
incomplete.

**Does your app collect or share any of the required user data types?** -> **Yes**

For each type below choose: Collected **Yes**, Shared **No**, **Data is processed ephemerally: Yes**, Required (users
cannot turn collection off), Purpose **App functionality**.

| Data type (Google's list) | Why |
|---|---|
| Messages -> **Other in-app messages** | encrypted text and display names relayed to the friend, kept in memory up to 30 minutes |
| Photos and videos -> **Photos**, **Videos** | encrypted media messages, same handling |
| Audio files -> **Voice or sound recordings** | encrypted voice messages, same handling |
| Files and docs -> **Files and docs** | encrypted file messages, same handling |

Not collected (answer No / do not tick): name, email, address, phone, user IDs, precise or approximate location,
contacts, calendar, web browsing, search history, installed apps, device or other IDs (the chat code and secret are
random values the app creates itself; no advertising ID, Android ID or IMEI is used), financial, health, app
performance/crash logs, diagnostics.

(The server sees the sender's IP address while the connection is open and uses it in memory only to limit abuse; it
does not store it or keep logs. Google's form treats this as ephemeral request processing, not collection. If you
prefer to be extra cautious, also add **Device or other IDs / IP address**: Collected, not shared, ephemeral, security.)

**Security practices**

- Data is encrypted in transit: **Yes** (HTTPS / WSS, plus end-to-end encryption).
- You provide a way for users to request that their data be deleted: **Yes**. Users delete or leave a chat in the app,
  which deletes its data on the server; everything also expires after 30 minutes. No account exists to delete.
- Committed to follow the Families Policy: **No**. Independent security review: **No**.
- Data deletion URL (if asked): the privacy policy URL.

## 6. Foreground service declaration (special use)

Foreground service type: **Special use**. Paste:

```
The app keeps one small end-to-end-encrypted connection open (a foreground service with a low-priority "Ready to play" notification) so it can show a generic game reminder, for example "Your game is waiting!", when a friend sends a private message while the app is closed. No message content or sender name is read or shown. The user can turn the background connection off at any time with the "Secret signal" switch in Settings.
```

If the console asks why no other type fits: dataSync is limited to 6 hours per day on Android 15+, which would stop the
reminders; the app is a one-to-one messenger without a push-notification service (no Firebase), so a persistent
connection is needed. If asked for a demo video, record: Settings -> Secret signal ON, close the app, send a message
from a second device, show the generic notification, then switch the signal OFF.

## 7. Permissions

- **Microphone (RECORD_AUDIO)**: voice messages, used only while recording.
- **Notifications (POST_NOTIFICATIONS)**: the generic game reminder.
- Foreground service: see section 6. Internet: normal.
- No contacts, SMS, location, camera, storage or other sensitive permissions are requested.

## 8. Other declarations

- Government app: **No**. Financial features: **None**. Health: **None**. News: **No**. COVID-19: **No**.
- Advertising ID: the app does **not** use it.
- Account deletion: not applicable (no accounts); explain "delete or leave a chat in the app" if asked.

## 9. Screenshots to capture (phone)

1. Games hub (all six games).
2. A game in play (for example 2048 or Snake).
3. The chat area: private pass card and "Your chats".
4. A chat conversation with a few messages and ticks.
5. Settings (Security, Hold time, Message signal).

Take them with **Block screenshots OFF** (Settings -> Security) and switch it back ON afterwards. Show only test data.
The chat screenshots should make clear that the app contains a private chat (this supports the "no deceptive
behaviour" requirement).

## 10. Closed testing

Testing -> Closed testing -> Create track -> upload `Gamaroon-1.0.aab` -> add testers (an email list or a Google Group;
a personal developer account needs **at least 12 testers opted in for 14 continuous days** before you can apply for
production) -> send the opt-in link to every tester.

Release notes: use the "What's new" text from `STORE_LISTING.md`.
