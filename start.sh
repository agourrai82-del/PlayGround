#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-3000}"
export PORT
ROOT="$(pwd)"
DIST="$ROOT/dist"
META_DIR="${OPENCODE_WEB_DIR:-/tmp}"
META_FILE="$META_DIR/deployment-output.json"
/usr/bin/time -p mkdir -p "$DIST" "$META_DIR"
if /usr/bin/time -p test -f "$ROOT/package.json"; then
  if /usr/bin/time -p test ! -d "$ROOT/node_modules"; then
    /usr/bin/time -p npm install --no-audit --no-fund --prefix "$ROOT"
  fi
  if /usr/bin/time -p test -f "$ROOT/scripts/build.mjs"; then
    /usr/bin/time -p node "$ROOT/scripts/build.mjs"
  fi
fi
if /usr/bin/time -p test ! -f "$DIST/index.html"; then
  echo "start.sh: missing built output $DIST/index.html" >&2
  exit 1
fi
/usr/bin/time -p node -e 'const fs=require("fs");const f=process.argv[1];const data={project:process.argv[2],directory:process.argv[3]};fs.writeFileSync(f,JSON.stringify(data));console.log("deployment-output:",JSON.stringify(data));' "$META_FILE" "$ROOT" "$DIST"
/usr/bin/time -p python3 -c 'import sys;print(sys.version)'
exec /usr/bin/time -p python3 -m http.server "$PORT" --directory "$DIST" --bind 0.0.0.0
