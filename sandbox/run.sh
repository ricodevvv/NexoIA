#!/bin/sh
exec docker run --rm -i \
  --network nexo-sandbox \
  -e HTTPS_PROXY=http://nexo-sandbox-egress:3128 \
  -e HTTP_PROXY=http://nexo-sandbox-egress:3128 \
  -e NODE_USE_ENV_PROXY=1 \
  -e NODE_NO_WARNINGS=1 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --tmpfs /tmp/pkgs:rw,noexec,nosuid,size=512m,uid=1000,gid=1000 \
  --memory 1g --memory-swap 1g \
  --cpus 1 \
  --pids-limit 64 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --user node \
  nexo-sandbox:latest
