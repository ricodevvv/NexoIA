#!/bin/sh
set -e
mkdir -p "$HOME/workspace" "$HOME/.config/nexocode"
if [ -n "$NEXO_CONFIG" ]; then
  printf '%s' "$NEXO_CONFIG" > "$HOME/.config/nexocode/nexocode.json"
fi
git config --global init.defaultBranch main
git config --global --replace-all credential.https://github.com.helper "!node /usr/local/lib/nexo/git-credential.mjs"
git config --global user.name >/dev/null || git config --global user.name "${NEXO_USER_NAME:-Nexo}"
git config --global user.email >/dev/null || git config --global user.email "${NEXO_USER_EMAIL:-workspace@nexo.local}"
if [ ! -d "$HOME/workspace/.git" ]; then
  git -C "$HOME/workspace" init -q -b main
fi
git -C "$HOME/workspace" config --unset user.name 2>/dev/null || true
git -C "$HOME/workspace" config --unset user.email 2>/dev/null || true
printf 'protocol=https\nhost=github.com\n\n' | GIT_TERMINAL_PROMPT=0 git credential fill >/dev/null 2>&1 || true
cd "$HOME/workspace"
exec nexocode serve --port 4096 --hostname 0.0.0.0
