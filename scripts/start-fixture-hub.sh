#!/usr/bin/env bash
# Starts a hub that sees only the checked-in fixtures: a fresh copy in a new temporary directory as HOME and the config
# dir, the stub claude first on PATH, and a free port. Prints the launch link and runs until stopped; stopping the
# script stops the hub and removes the copy.
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
dir=$(mktemp -d "${TMPDIR:-/tmp}/hub-fixture.XXXXXX")
trap 'rm -rf "$dir"' EXIT
cp -R "$repo/src/e2e/fixtures/." "$dir"
mkdir -p "$dir/.claude"
export HOME="$dir"
export CLAUDE_CONFIG_DIR="$dir/.claude"
export PATH="$dir/bin:$PATH"

cd "$repo"
node_modules/.bin/tsc -p src/web/tsconfig.json
# A child rather than exec'd, so the EXIT trap still runs to remove the copy. The trap stops the hub, which a signal
# to this script alone would leave running on its port.
node src/e2e/fixture-main.ts &
hub=$!
trap 'kill "$hub" 2>/dev/null || true; rm -rf "$dir"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
wait "$hub"
