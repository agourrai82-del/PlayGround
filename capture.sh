#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
RUNTIME="${RUNTIME_DIR:-/home/runner/work/_temp/omgithub-runtime}"
CAPTURE_SCRIPT="$RUNTIME/scripts/default-capture.mjs"
/usr/bin/time -p test -n "${CAPTURE_URL:-}" || { echo "capture.sh: CAPTURE_URL is required" >&2; exit 1; }
/usr/bin/time -p test -n "${CAPTURE_DIR:-}" || { echo "capture.sh: CAPTURE_DIR is required" >&2; exit 1; }
/usr/bin/time -p mkdir -p "$CAPTURE_DIR"
/usr/bin/time -p test -f "$CAPTURE_SCRIPT" || { echo "capture.sh: missing $CAPTURE_SCRIPT" >&2; exit 1; }
/usr/bin/time -p node "$CAPTURE_SCRIPT"
STATUS=$?
/usr/bin/time -p test -f "$CAPTURE_DIR/final-desktop.png" || { echo "capture.sh: missing final-desktop.png" >&2; exit 1; }
/usr/bin/time -p test -f "$CAPTURE_DIR/final-mobile.png" || { echo "capture.sh: missing final-mobile.png" >&2; exit 1; }
exit $STATUS
