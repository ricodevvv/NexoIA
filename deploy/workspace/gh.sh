#!/bin/sh
if [ -z "$GH_TOKEN" ] && [ -z "$GITHUB_TOKEN" ]; then
  GH_TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | GIT_TERMINAL_PROMPT=0 git credential fill 2>/dev/null | sed -n 's/^password=//p')
  export GH_TOKEN
fi
exec /usr/bin/gh "$@"
