#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
RAW=$(sed -e 's/^MONGODB_URI=//' -e 's/^"//' -e 's/"$//' /tmp/.become_e2e_uri | tr -d '\n')
SCRATCH=${RAW/\/jondonfitdb/\/become_e2e_meals}
case "$SCRATCH" in
  *become_e2e_meals*) ;;
  *) echo "refusing: scratch db not applied" >&2; exit 1 ;;
esac
export MONGODB_URI="$SCRATCH"
export AUTH_MONGODB_URI="$SCRATCH"
export NEXT_PUBLIC_APP_URL="http://localhost:3210"
exec npx next dev -p 3210
