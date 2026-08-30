#!/usr/bin/env bash
# =============================================================================
# stop.sh — hentikan Ayam Counter (backend + dashboard + cloudflared)
#
# Pemakaian:
#   bash stop.sh              # stop semua yang di-start oleh start.sh
#   bash stop.sh --keep-web   # biarkan dashboard tetap jalan
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$WEB_DIR/logs"
KEEP_WEB=0

[[ "${1:-}" == "--keep-web" ]] && KEEP_WEB=1

log()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }

kill_pidfile() { # $1 = file pid, $2 = nama
  if [[ -f "$1" ]]; then
    local pid
    pid="$(cat "$1" 2>/dev/null)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      # beri waktu graceful, lalu paksa
      for _ in $(seq 1 10); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
      kill -9 "$pid" 2>/dev/null || true
      log "$2 dihentikan (PID $pid)"
    else
      log "$2 memang sudah mati"
    fi
    rm -f "$1"
  fi
}

# cloudflared paling dulu (agar tunnel tidak menahan proses lain)
kill_pidfile "$LOG_DIR/cloudflared.pid" "cloudflared"
pkill -f "cloudflared tunnel --url" 2>/dev/null || true

# backend
kill_pidfile "$LOG_DIR/backend.pid" "Backend Flask"

# dashboard
if [[ $KEEP_WEB -eq 1 ]]; then
  warn "Dashboard dibiarkan jalan (--keep-web)"
else
  kill_pidfile "$LOG_DIR/web.pid" "Dashboard"
fi

# fallback: pidfile hilang tapi port masih tertanam (mis. start manual)
if [[ $KEEP_WEB -eq 0 ]] && command -v fuser >/dev/null 2>&1; then
  fuser -k 3000/tcp 2>/dev/null && log "Port 3000 dibebaskan (fuser)"
fi
if command -v fuser >/dev/null 2>&1; then
  fuser -k 5000/tcp 2>/dev/null && log "Port 5000 dibebaskan (fuser)"
fi

log "Selesai. Log tersisa di $LOG_DIR/"
