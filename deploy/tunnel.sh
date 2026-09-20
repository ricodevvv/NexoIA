#!/usr/bin/env bash
set -uo pipefail

ENV_FILE=/etc/nexo/nexo.env
URL_FILE=/etc/nexo/public-url
found=""

cloudflared tunnel --no-autoupdate --url http://127.0.0.1:3000 2>&1 | while IFS= read -r line; do
  echo "$line"
  [[ -n "$found" ]] && continue
  url=$(grep -oE 'https://[a-z0-9]+(-[a-z0-9]+)+\.trycloudflare\.com' <<<"$line" | head -1 || true)
  if [[ -n "$url" ]]; then
    found="$url"
    echo "$url" >"$URL_FILE"
    chmod 644 "$URL_FILE"
    sed -i "s|^BETTER_AUTH_URL=.*|BETTER_AUTH_URL=$url|" "$ENV_FILE"
    systemctl restart nexo.service
    echo "Nexo publicado en $url"
  fi
done
