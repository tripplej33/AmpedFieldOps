#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/run-tsx-in-docker.sh path/to/script.ts [args...]
# Runs a TypeScript script using a temporary Node container with tsx installed.

SCRIPT_PATH=${1:-}
shift || true
if [ -z "$SCRIPT_PATH" ]; then
  echo "Usage: $0 script.ts [args...]" >&2
  exit 2
fi

CONTAINER_IMAGE=node:20-bullseye

# Ensure absolute path inside container
WORKDIR=/work

# Use host networking on Linux so the container can reach services bound to 127.0.0.1 on the host
NETWORK_ARGS=""
if [ "$(uname -s)" = "Linux" ]; then
  NETWORK_ARGS="--network host"
fi

docker run --rm $NETWORK_ARGS -v "$PWD":$WORKDIR -w $WORKDIR -e SUPABASE_URL -e SUPABASE_SERVICE_ROLE_KEY -e VITE_SUPABASE_ANON_KEY $CONTAINER_IMAGE bash -lc \
  "set -euo pipefail; npm init -y >/dev/null 2>&1 || true; npm i tsx @supabase/supabase-js >/dev/null 2>&1; npx tsx $SCRIPT_PATH $*"
