#!/usr/bin/env bash
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST=/opt/nexo

rsync -a --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude .env.local --exclude '/*.png' --exclude '*.log' \
  --exclude '*.mp4' --exclude '*.MP4' --exclude '*.mov' --exclude '*.MOV' \
  --exclude test-results --exclude playwright-report \
  "$SRC/" "$DEST/"

SANDBOX_HASH=$(cat "$SRC"/sandbox/Dockerfile "$SRC"/sandbox/package.json "$SRC"/sandbox/*.mjs "$SRC"/sandbox/run.sh | sha256sum | cut -c1-16)
if [[ "$(sudo docker image inspect nexo-sandbox:latest -f '{{index .Config.Labels "nexo.hash"}}' 2>/dev/null)" != "$SANDBOX_HASH" ]]; then
  sudo docker build -q --label "nexo.hash=$SANDBOX_HASH" -t nexo-sandbox:latest "$SRC/sandbox" >/dev/null
  echo "Imagen del sandbox actualizada"
fi
sudo install -o root -g root -m 755 "$SRC/sandbox/run.sh" /usr/local/bin/nexo-sandbox

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
