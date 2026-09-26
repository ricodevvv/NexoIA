#!/bin/sh
set -e
mkdir -p "$HOME/workspace" "$HOME/.config/nexocode"
if [ -n "$NEXO_UPSTREAM_PROXY" ]; then
  (while true; do node /usr/local/lib/nexo/local-proxy.mjs; sleep 1; done) &
  i=0
  until node -e 'require("net").connect(3128,"127.0.0.1").on("connect",()=>process.exit(0)).on("error",()=>process.exit(1))' 2>/dev/null || [ $i -ge 50 ]; do
    i=$((i + 1)); sleep 0.1
  done
  mkdir -p "$HOME/.m2" "$HOME/.gradle"
  if [ ! -f "$HOME/.m2/settings.xml" ]; then
    cat > "$HOME/.m2/settings.xml" <<'XML'
<settings>
  <proxies>
    <proxy><id>nexo-https</id><active>true</active><protocol>https</protocol><host>127.0.0.1</host><port>3128</port><nonProxyHosts>localhost|127.0.0.1</nonProxyHosts></proxy>
    <proxy><id>nexo-http</id><active>true</active><protocol>http</protocol><host>127.0.0.1</host><port>3128</port><nonProxyHosts>localhost|127.0.0.1</nonProxyHosts></proxy>
  </proxies>
</settings>
XML
  fi
  if ! grep -qs "nexo-proxy" "$HOME/.gradle/gradle.properties"; then
    cat >> "$HOME/.gradle/gradle.properties" <<'PROPS'
# nexo-proxy
systemProp.http.proxyHost=127.0.0.1
systemProp.http.proxyPort=3128
systemProp.https.proxyHost=127.0.0.1
systemProp.https.proxyPort=3128
systemProp.http.nonProxyHosts=localhost|127.0.0.1
org.gradle.java.installations.auto-download=true
PROPS
  fi
fi
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
