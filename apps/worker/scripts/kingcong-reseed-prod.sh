#!/bin/bash
# Re-seed the KingCong session cookie on PROD without a rebuild/redeploy.
#
# When the cookie finally dies (remember token expired → HTTP refresh can't
# recover), re-capture a fresh cookie and push it to the running worker:
#   1) Log into kingcongstudio.com in real Chrome → DevTools → Application →
#      Cookies → copy the full cookie (must include PHPSESSID + remember_*).
#   2) Paste it into apps/worker/.kingcong-session.json:
#        { "cookie": "PHPSESSID=...; remember_...=...; ...", "source": "manual" }
#   3) Run this script.
#
# It copies that file into the host volume (/opt/vx-admin-data) — which is
# bind-mounted into the worker at /data — and restarts the worker so the
# provider re-reads it. No image rebuild, no full deploy.
set -e

SERVER="ec2-user@3.216.170.208"
SSH_OPTS="-o StrictHostKeyChecking=no"
REMOTE_FILE="/opt/vx-admin-data/kingcong-session.json"
LOCAL_FILE="$(cd "$(dirname "$0")/.." && pwd)/.kingcong-session.json"

[ -f "$LOCAL_FILE" ] || { echo "ERROR: $LOCAL_FILE not found — create it first (see header)." >&2; exit 1; }

echo "Pushing $LOCAL_FILE -> $SERVER:$REMOTE_FILE ..."
scp $SSH_OPTS "$LOCAL_FILE" "$SERVER:/tmp/kc-reseed.json"
ssh $SSH_OPTS "$SERVER" "sudo cp /tmp/kc-reseed.json $REMOTE_FILE && rm -f /tmp/kc-reseed.json && docker restart vx-worker >/dev/null && echo 'vx-worker restarted with the fresh cookie.'"
echo "Done."
