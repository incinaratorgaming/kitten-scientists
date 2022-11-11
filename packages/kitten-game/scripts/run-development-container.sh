#!/usr/bin/env bash

set -o errexit

BASEDIR=$(dirname "$(readlink -f "$0")")

yarn userscript:build
yarn devcontainer:build

echo "Removing previous container..."
podman stop kitten-game || true
podman rm kitten-game || true
echo "Previous container removed or non-existent."
echo ""

echo "Starting new container..."
podman run \
  --detach \
  --volume "${BASEDIR}/../../userscript/output":/kitten-game/kitten-scientists:Z \
  --name kitten-game \
  --publish 8100:8080 kitten-game
echo "Container started."

echo ""
echo "Kitten game should be running at http://127.0.0.1:8100"
