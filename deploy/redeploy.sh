#!/usr/bin/env bash
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST=/opt/nexo

rsync -a --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude .env.local --exclude .kube --exclude '/*.png' --exclude '*.log' \
  --exclude '*.mp4' --exclude '*.MP4' --exclude '*.mov' --exclude '*.MOV' \
  --exclude test-results --exclude playwright-report \
  "$SRC/" "$DEST/"

SANDBOX_HASH=$(cat "$SRC"/sandbox/Dockerfile "$SRC"/sandbox/package.json "$SRC"/sandbox/*.mjs "$SRC"/sandbox/run.sh | sha256sum | cut -c1-16)
if [[ "$(sudo docker image inspect nexo-sandbox:latest -f '{{index .Config.Labels "nexo.hash"}}' 2>/dev/null)" != "$SANDBOX_HASH" ]]; then
  sudo docker build -q --label "nexo.hash=$SANDBOX_HASH" -t nexo-sandbox:latest "$SRC/sandbox" >/dev/null
  echo "Imagen del sandbox actualizada"
fi
sudo install -o root -g root -m 755 "$SRC/sandbox/run.sh" /usr/local/bin/nexo-sandbox

if ! sudo docker network inspect nexo-sandbox >/dev/null 2>&1; then
  sudo docker network create --internal -o com.docker.network.bridge.gateway_mode_ipv4=isolated nexo-sandbox >/dev/null
  echo "Red del sandbox creada"
fi
if [[ "$(sudo docker inspect nexo-sandbox-egress -f '{{index .Config.Labels "nexo.hash"}} {{.State.Running}}' 2>/dev/null)" != "$SANDBOX_HASH true" ]]; then
  sudo docker rm -f nexo-sandbox-egress >/dev/null 2>&1 || true
  sudo docker run -d --name nexo-sandbox-egress --label "nexo.hash=$SANDBOX_HASH" \
    --restart unless-stopped --read-only --cap-drop ALL --security-opt no-new-privileges \
    --memory 256m --pids-limit 64 --user node --network bridge \
    --entrypoint node nexo-sandbox:latest egress.mjs >/dev/null
  sudo docker network connect nexo-sandbox nexo-sandbox-egress
  echo "Proxy de salida del sandbox actualizado"
fi
if command -v k3s >/dev/null && sudo k3s kubectl -n nexo-ws get deployment nexo-egress >/dev/null 2>&1; then
  if [[ "$(sudo k3s kubectl -n nexo-ws get deployment nexo-egress -o jsonpath='{.spec.template.metadata.annotations.nexo\.hash}')" != "$SANDBOX_HASH" ]]; then
    sudo docker save nexo-sandbox:latest | sudo k3s ctr images import - >/dev/null
    sudo k3s kubectl -n nexo-ws patch deployment nexo-egress --type merge \
      -p "{\"spec\":{\"template\":{\"metadata\":{\"annotations\":{\"nexo.hash\":\"$SANDBOX_HASH\"}}}}}" >/dev/null
    echo "Proxy de salida de los espacios actualizado"
  fi
fi

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
