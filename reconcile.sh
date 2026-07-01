#!/usr/bin/env bash
# One-command food-data reconciler. Creds come from webapp/.env.local
# (PROD_MONGODB_URI + USDA_API_KEY) — no params needed.
#
#   ./reconcile.sh          start the slow reconcile+fix in the background
#   ./reconcile.sh dry      same, but dry-run (no writes)
#   ./reconcile.sh status   show latest progress + running counts
#   ./reconcile.sh stop     stop the background run (resumable — re-run to continue)
#   ./reconcile.sh watch    live-tail the log
#
# It self-throttles to HALF each source's rate limit and checkpoints as it goes,
# so it's safe to leave running for hours and safe to kill/resume.

set -euo pipefail
cd "$(dirname "$0")/webapp"

# make npx/node available even from a bare cron/ssh shell
command -v npx >/dev/null 2>&1 || { . "$HOME/.nvm/nvm.sh" 2>/dev/null || true; nvm use --silent 2>/dev/null || true; }

LOG=/tmp/reconcile-slow.log
RESULTS=scripts/reports/reconcile-slow.results.json
SCRIPT=scripts/reconcile-slow.ts
CMD="${1:-run}"

running() { pgrep -f "reconcile-slow.ts" >/dev/null 2>&1; }

case "$CMD" in
  status)
    if running; then echo "● running"; else echo "○ not running"; fi
    echo "--- last progress ---"
    grep -E "^\[" "$LOG" 2>/dev/null | tail -3 || echo "(no log yet)"
    [ -f "$RESULTS" ] && { echo "--- results so far ---"; node -e "const d=require('./$RESULTS');console.log(JSON.stringify(d.counts),'applied='+d.applied)" 2>/dev/null || true; }
    ;;
  stop)
    pkill -f "reconcile-slow.ts" && echo "stopped (progress saved — re-run to resume)" || echo "nothing running"
    ;;
  watch)
    tail -f "$LOG"
    ;;
  dry|run)
    if running; then echo "already running — use ./reconcile.sh status"; exit 0; fi
    FLAGS="--prod"; [ "$CMD" = "run" ] && FLAGS="--prod --apply"
    setsid nohup npx tsx "$SCRIPT" $FLAGS >> "$LOG" 2>&1 < /dev/null &
    disown 2>/dev/null || true
    sleep 2
    echo "started ($([ "$CMD" = dry ] && echo DRY-RUN || echo APPLY)) in the background."
    echo "  watch:   ./reconcile.sh watch      (or: tail -f $LOG)"
    echo "  status:  ./reconcile.sh status"
    echo "  stop:    ./reconcile.sh stop        (resumable)"
    ;;
  *)
    echo "usage: ./reconcile.sh [run|dry|status|stop|watch]"; exit 1;;
esac
