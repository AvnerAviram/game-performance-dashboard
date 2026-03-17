#!/bin/bash
set -euo pipefail

# Game Analytics Dashboard - Deploy to EC2
# Usage: ./deploy.sh [user@host]
#
# Prerequisites on EC2:
#   sudo apt install nginx apache2-utils   # or yum install nginx httpd-tools
#   sudo htpasswd -c /etc/nginx/.htpasswd avner
#   sudo certbot --nginx -d YOUR_DOMAIN
#   sudo mkdir -p /var/www/game-dashboard

REMOTE="${1:-ec2-user@YOUR_EC2_HOST}"
REMOTE_DIR="/var/www/game-dashboard/dist"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Building dashboard..."
cd "$SCRIPT_DIR"
npm run build

echo "==> Verifying build safety..."
if [ -f dist/data/.env ]; then
    echo "ERROR: dist/data/.env exists! Build script is still copying secrets."
    exit 1
fi

DIST_DATA_COUNT=$(ls dist/data/ | wc -l | tr -d ' ')
if [ "$DIST_DATA_COUNT" -gt 3 ]; then
    echo "WARNING: dist/data/ has $DIST_DATA_COUNT files (expected 2). Extra pipeline files may be leaking."
    ls dist/data/
    read -p "Continue anyway? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then exit 1; fi
fi

echo "==> Deploying to $REMOTE:$REMOTE_DIR..."
rsync -avz --delete \
    --exclude='*.map' \
    dist/ "$REMOTE:$REMOTE_DIR/"

echo "==> Reloading Nginx..."
ssh "$REMOTE" "sudo nginx -t && sudo systemctl reload nginx"

echo "==> Done! Dashboard deployed."
