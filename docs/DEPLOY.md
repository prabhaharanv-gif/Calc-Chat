# Hosting the Gamaroon server for free (Oracle Cloud Always Free)

> No card? See `DEPLOY_HUGGINGFACE.md` (free, no card, good for the closed test).

The server is a small Node.js app (Express + Socket.IO). It keeps everything in RAM and writes nothing to disk, so a
tiny free VM is enough. The Android app only needs one thing from you: a permanent **https** address.

> Why not Vercel / Supabase: the server needs long-lived WebSocket connections and in-memory rooms, which serverless
> platforms do not provide.

## 1. Create the VM (about 20 minutes, done in the browser)

1. Sign up at <https://www.oracle.com/cloud/free/>. A card is used for identity verification only; Always Free
   resources are not charged. Pick a **home region close to you** (for example Mumbai or Hyderabad). It cannot be
   changed later.
2. Console -> **Compute -> Instances -> Create instance**.
   - Image: **Ubuntu 22.04** (or 24.04).
   - Shape: **VM.Standard.E2.1.Micro** (AMD, Always Free) or **VM.Standard.A1.Flex** (Ampere, 1 OCPU / 6 GB, Always Free).
   - Networking: keep the default VCN and **assign a public IPv4 address**.
   - SSH keys: **generate a key pair and download the private key** (keep it safe), or paste your own public key.
3. Open the web ports. Instance -> subnet -> **Security List -> Add Ingress Rules**:
   - Source CIDR `0.0.0.0/0`, TCP, destination port **80**
   - Source CIDR `0.0.0.0/0`, TCP, destination port **443**
4. Note the instance's **public IP**.

## 2. A free domain name

Play Store builds need a stable `https://` name. Free option: <https://www.duckdns.org>

1. Sign in, create a subdomain such as `gamaroon` (gives `gamaroon.duckdns.org`).
2. Set its **current ip** to the VM's public IP and save.

(You can use your own domain instead: add an `A` record pointing to the VM's IP.)

## 3. Install the server (one command)

From this repository on your PC (PowerShell):

```powershell
scp -i path\to\ssh-key.key -r server deploy ubuntu@<VM-IP>:~/
ssh -i path\to\ssh-key.key ubuntu@<VM-IP>
```

On the VM:

```bash
sudo bash ~/deploy/setup.sh gamaroon.duckdns.org you@example.com
```

(`you@example.com` is the contact address shown on the privacy policy page; use an address you are happy to make public.)

The script installs Node.js 20 and Caddy, runs the server as a restricted systemd service (auto-restart, starts on
boot), and gets an HTTPS certificate automatically. When it finishes, open `https://gamaroon.duckdns.org/` in a
browser: the server answers (the first request can take about 30 seconds while the certificate is issued).

The public privacy policy (required by the Play Store) is now at `https://gamaroon.duckdns.org/privacy`.

## 4. Point the app at it and build

```powershell
cd client
$env:VITE_SERVER_URL = "https://gamaroon.duckdns.org"
npm run build
npx cap sync android
cd android
.\gradlew.bat bundleRelease      # signed AAB for the Play Store
```

(For a quick test APK use `assembleDebug` instead.)

## Updating the server later

```powershell
scp -i path\to\ssh-key.key -r server deploy ubuntu@<VM-IP>:~/
ssh -i path\to\ssh-key.key ubuntu@<VM-IP> "sudo bash ~/deploy/setup.sh gamaroon.duckdns.org you@example.com"
```

## Good to know

- Restarting the server (or the VM) deletes all rooms and messages. That is by design (nothing is stored); the apps
  re-register their rooms automatically.
- Oracle may reclaim an Always Free VM that stays almost completely idle for a long time. Upgrading the account to
  "Pay As You Go" (still free while you stay inside the Always Free limits) greatly reduces that risk.
- Check the service: `sudo systemctl status gamaroon` and `sudo journalctl -u gamaroon -n 50`.
- The Node server listens on port 4000 and is not exposed; only Caddy (80/443) is reachable from the internet.
