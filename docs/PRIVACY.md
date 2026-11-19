# Privacy policy

The public policy page is served by the server itself at **https://<your-domain>/privacy** (source:
`server/privacy.html`). Use that URL in the Play Console ("Privacy policy") and in the store listing.

Set the contact address shown on the page with the `PRIVACY_EMAIL` environment variable (the installer writes it to
`/etc/gamaroon.env`: `sudo bash ~/deploy/setup.sh <domain> <email>`). Update `PRIVACY_DATE` (or the default in
`server/index.js`) whenever the policy text changes.
