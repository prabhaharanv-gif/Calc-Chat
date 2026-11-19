#!/usr/bin/env bash
# Gamaroon server installer for a fresh Ubuntu VM (tested layout: Oracle Cloud Always Free, Ubuntu 22.04/24.04).
#
#   1. copy the server folder to the VM:   scp -r server deploy ubuntu@<VM-IP>:~/
#   2. on the VM:                          sudo bash ~/deploy/setup.sh your.domain.name
#
# It installs Node.js 20, runs the server as a locked-down systemd service (restarts on crash/reboot) and puts
# Caddy in front of it for automatic HTTPS (WebSockets work). Nothing is stored on disk by the server itself.
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then echo "usage: sudo bash setup.sh your.domain.name"; exit 1; fi
if [[ $EUID -ne 0 ]]; then echo "run with sudo"; exit 1; fi

SRC="$(cd "$(dirname "$0")/.." && pwd)"        # folder that contains server/ and deploy/
APP=/opt/gamaroon

echo "==> Packages"
apt-get update -y
apt-get install -y curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https rsync

echo "==> Node.js 20"
if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "==> Caddy (automatic HTTPS)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -y
  apt-get install -y caddy
fi

echo "==> App files"
id gamaroon >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin gamaroon
mkdir -p "$APP"
rsync -a --delete --exclude node_modules --exclude test.mjs "$SRC/server/" "$APP/server/"
(cd "$APP/server" && npm ci --omit=dev)
chown -R gamaroon:gamaroon "$APP"

echo "==> systemd service"
install -m 644 "$SRC/deploy/gamaroon.service" /etc/systemd/system/gamaroon.service
systemctl daemon-reload
systemctl enable --now gamaroon
systemctl restart gamaroon

echo "==> Caddy for $DOMAIN"
sed "s/{{DOMAIN}}/$DOMAIN/g" "$SRC/deploy/Caddyfile.template" > /etc/caddy/Caddyfile
systemctl enable caddy
systemctl restart caddy

echo "==> Firewall (Oracle's Ubuntu images block 80/443 by default)"
if command -v iptables >/dev/null; then
  for p in 80 443; do
    iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null || iptables -I INPUT 5 -p tcp --dport "$p" -j ACCEPT
  done
  command -v netfilter-persistent >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
  netfilter-persistent save || true
fi

sleep 3
echo
echo "Server status:"; systemctl --no-pager --lines=3 status gamaroon || true
echo
echo "Test (from anywhere): https://$DOMAIN/   (first HTTPS request can take ~30 s while Caddy gets the certificate)"
echo "Remember: also open ports 80 and 443 in the Oracle Cloud network rules (see docs/DEPLOY.md)."
