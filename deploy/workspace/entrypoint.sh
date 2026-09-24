#!/bin/sh
set -e
mkdir -p "$HOME/workspace" "$HOME/.config/nexocode"
if [ -n "$NEXO_CONFIG" ]; then
  printf '%s' "$NEXO_CONFIG" > "$HOME/.config/nexocode/nexocode.json"
fi
if [ ! -d "$HOME/workspace/.git" ]; then
  git -C "$HOME/workspace" init -q -b main
  git -C "$HOME/workspace" config user.name "${NEXO_USER_NAME:-Nexo}"
  git -C "$HOME/workspace" config user.email "${NEXO_USER_EMAIL:-workspace@nexo.local}"
fi
cd "$HOME/workspace"
exec nexocode serve --port 4096 --hostname 0.0.0.0
