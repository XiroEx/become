#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
set -a; . /tmp/hb/uri.env; set +a
export NEXT_PUBLIC_APP_URL="http://localhost:3210"
exec npx next dev -p 3210
