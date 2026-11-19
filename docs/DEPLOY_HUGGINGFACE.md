# Free hosting on Hugging Face Spaces (no card needed)

Good for **testing and the Play Store closed test**. Move to a small VPS (see `DEPLOY.md`) before a real public
release: free Spaces can go to sleep, and Hugging Face does not intend Spaces to be production backends.

The server keeps everything in memory and stores nothing, so it fits a free Space (Docker, 2 vCPU / 16 GB RAM).

## 1. Create the Space

1. Sign up at <https://huggingface.co> (email only).
2. **New -> Space**
   - Space name: `gamaroon`
   - SDK: **Docker** -> **Blank**
   - Hardware: **CPU basic (free)**
   - Visibility: **Public** (the app cannot send an access token, so a private Space will not work). Only the server
     code is public; chats are end-to-end encrypted and the server stores nothing.
3. Create it. Your server address will be `https://<your-username>-gamaroon.hf.space` (all lower case).

## 2. Build the upload folder

On your PC, in this repository:

```powershell
node deploy/huggingface/build-space.mjs
```

This creates `deploy/huggingface/space/` containing `Dockerfile`, `README.md` and `server/` (4 files).

## 3. Upload

**Easiest (browser):** open your Space -> **Files** -> **Add file -> Upload files**. Drag **everything inside**
`deploy/huggingface/space/` (`Dockerfile`, `README.md` and the `server` folder) and commit. The uploaded `README.md`
replaces the default one (it holds the Space settings: Docker, port 7860).

**Or with git:** create an access token (Settings -> Access Tokens -> *Write*), then

```powershell
git clone https://huggingface.co/spaces/<your-username>/gamaroon hf-gamaroon
Copy-Item -Recurse -Force deploy\huggingface\space\* hf-gamaroon\
cd hf-gamaroon
git add .
git commit -m "Gamaroon server"
git push
```

(use your username and the token as the password).

## 4. Settings

Space -> **Settings -> Variables and secrets -> New variable**:

| Name | Value |
|------|-------|
| `PRIVACY_EMAIL` | the public contact address for the privacy page (use a dedicated address) |

Variables are visible to anyone who opens a public Space, which is fine here: the address is printed on the privacy
page anyway.

The Space rebuilds automatically. Watch **Logs**; when it shows "Running", open
`https://<your-username>-gamaroon.hf.space/privacy`. If you see the policy page, the server works.

## 5. Build the app against it

```powershell
cd client
$env:VITE_SERVER_URL = "https://<your-username>-gamaroon.hf.space"
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug      # test APK   (use bundleRelease for the Play Store AAB)
```

## Things to know

- **Sleep:** a free Space that gets no traffic for about 2 days is paused. The next request wakes it (it takes about a
  minute). The apps keep a background connection open, which usually counts as traffic. A free uptime monitor
  (for example UptimeRobot, 5-minute check of `/privacy`) keeps it awake during the closed test.
- **Restarts** (and every redeploy) delete all rooms and messages. That is by design; apps re-register automatically.
- **Shared limits:** requests reach the server through Hugging Face's proxy, so the per-address rate limits are shared
  by all users. That is fine for a handful of testers but not for a public launch.
- **Updating:** run `build-space.mjs` again and upload the changed files; the Space rebuilds.
- If the build fails, open **Logs** and send me the last lines. (The Dockerfile has not been run on a machine with
  Docker here; the server itself was started from the generated folder and answers `/privacy` and `/api/host`.)
