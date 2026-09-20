#!/usr/bin/env bash
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST=/opt/nexo

rsync -a --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude .env.local --exclude '*.png' \
  "$SRC/" "$DEST/"

cd "$DEST"
pnpm install --frozen-lockfile --prefer-offline
DATABASE_URL="$(sudo grep -oP '^DATABASE_URL=\K.*' /etc/nexo/nexo.env)" npx drizzle-kit migrate
pnpm build
sudo systemctl restart nexo.service

for _ in $(seq 1 30); do
  curl -fs -o /dev/null http://127.0.0.1:3000/login && break
  sleep 1
done
echo "Listo: $(cat /etc/nexo/public-url 2>/dev/null || echo 'túnel todavía sin URL')"
