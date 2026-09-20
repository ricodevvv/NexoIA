#!/bin/sh
exec docker run --rm -i \
  --network none \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --memory 1g --memory-swap 1g \
  --cpus 1 \
  --pids-limit 64 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --user node \
  nexo-sandbox:latest
