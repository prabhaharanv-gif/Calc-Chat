# Deploying the Gamaroon server on Northflank (Free Sandbox, target cost: 0)

Nothing in the application was rewritten for this: same Node.js + Socket.IO server, RAM-only rooms, E2E encryption,
30-minute expiry, pairing and deletion logic. The repo only gained a `Dockerfile`, a `/healthz` endpoint, graceful
shutdown, and automatic guest re-join after a server restart.

## What the free plan gives (what actually happened on Nov 19 2026)

- Developer Sandbox: 2 services, 2 jobs, 1 addon, **one free project with limited resources**. Free platform plan.
- The pricing page says "No card needed", but the service form asked for a **card to verify the account and prevent
  abuse** before it allowed the free project. A card was added for verification only; the plan stays Developer Sandbox
  (never press **Upgrade**).
- New accounts start on **Pay as you go**. To get the free project: delete any project created during onboarding,
  then **Billing -> Plans -> Developer Sandbox -> Downgrade**, then **Create free project**.
- Free projects can only use **US - Central** or **Europe - West (London)**. London is the closest to India.
- Smallest compute plan (`nf-compute-10`: 0.1 vCPU, 256 MB) is enough for text chats; use `nf-compute-20` if you expect
  many photo/video messages (they are held in RAM).
- Northflank's docs describe the free plan as not meant for production. Fine for the Play Store closed test.
- Bandwidth limits are not stated; watch **Billing / Usage**.

## Environment variables

| Name | Value | Notes |
|------|-------|-------|
| `PORT` | `4000` | must match the public port below |
| `NODE_ENV` | `production` | |
| `PRIVACY_EMAIL` | your public contact address | shown on `/privacy` |
| `PRIVACY_DATE` | e.g. `November 2026` | optional |

No secrets are needed: the server has no API keys, tokens or database credentials. (Optional tuning, leave unset:
`MSG_TTL_MS`, `MSG_RATE`, `EVENT_RATE`, `CONN_RATE`. **Do not change `MSG_TTL_MS`**: the app promises 30 minutes.)

## Steps

1. <https://northflank.com> -> **Sign up** with GitHub. **Stop if a card is requested.**
2. Make sure the team is on **Developer Sandbox** (see above), then **Create free project** in **Europe - West (London).
3. **Create new -> Service -> Combined (build + deploy)**.
   - Repository: `prabhaharanv-gif/Calc-Chat` (private: authorise the Northflank GitHub app for this one repository).
   - Branch: `main`. Build type: **Dockerfile**, Dockerfile path `/Dockerfile`, build context `/`.
4. **Runtime / resources**: smallest plan (about 0.1 vCPU, 256 MB RAM). **Replicas: 1** (rooms live in RAM, so never
   run more than one instance).
5. **Networking -> Add port**: `4000`, protocol **HTTP**, **Publicly expose**. Northflank gives the service an
   `https://...code.run` address with TLS; WebSockets (wss) are carried on the same HTTP port.
6. **Health checks**: HTTP, path `/healthz`, port 4000 (liveness and readiness).
7. Add the environment variables above and **Deploy**.
8. When it is running, copy the public address, for example `https://p01--gamaroon--abc123.code.run`.

## Verify the deployment

```powershell
cd server
node remote-test.mjs https://<your-address>
```

It uses WebSocket-only connections (so it proves wss works), creates a throw-away room, and checks: health and
privacy pages, two devices at once, messages in both directions, 30-minute expiry, delivery receipts, reconnection
after a dropped connection, clear-for-both, silent wipe (authorised, idempotent), and the restart-recovery path. It
deletes its room afterwards and prints only pass/fail.

Then **restart the service** in the Northflank dashboard while two phones are in a chat: both should come back by
themselves within about 15 seconds (the owner re-opens the room, the guest re-joins with the same code + secret).
Messages from before the restart are gone by design.

## Build the app against it

```powershell
cd client
$env:VITE_SERVER_URL = "https://<your-address>"
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug      # test APK; use bundleRelease for the Play Store AAB
```

## Confirming the cost

Northflank dashboard -> **Billing / Usage**: it should show the Sandbox plan with 0 charged and the credit unused or
within the included resources. Do not add a payment method; if the free allowance is ever exceeded, resources stop
instead of silently becoming paid (confirm this in the billing page wording before relying on it).

## Limits to remember

- A restart or redeploy ends all chats (RAM only). Apps recover on their own, messages are lost.
- One instance only. No horizontal scaling on the free plan.
- Do not add "keep-alive" pingers; the service is always on without them.
