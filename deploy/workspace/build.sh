#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
TAG="${1:-nexo-workspace:2}"

sudo docker build -q --build-context prompts="$DIR/../../prompts/code" -t "$TAG" "$DIR" >/dev/null
sudo docker save "$TAG" | sudo k3s ctr images import - >/dev/null
echo "Imagen $TAG lista en k3s"
