#!/usr/bin/env bash
# =============================================================================
# start.sh — jalankan Ayam Counter (backend Flask + dashboard Next.js)
#
# Pemakaian:
#   bash start.sh                 # prod: standalone build (butuh install.sh dulu)
#   bash start.sh --dev           # mode development (next dev)
#   bash start.sh --tunnel        # + cloudflared quick tunnel → URL publik acak
#   bash start.sh --backend-dir /path/ayam-counter-web
#   bash start.sh --port 3000 --backend-port 5000
#   bash start.sh --skip-backend  # dashboard saja (backend sudah jalan di lain host)
#
# PID & log  : $WEB_DIR/logs/  (backend.pid, web.pid, cloudflared.pid, *.log)
# Tunnel URL : ditampilkan + disimpan ke $WEB_DIR/logs/tunnel-url.txt
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$WEB_DIR/logs"
RUNNER="$(command -v node || command -v bun || true)"

WEB_PORT=3000
BACKEND_PORT=5000
BACKEND_DIR="${AYAM_BACKEND_DIR:-}"
MODE="prod"
TUNNEL=0
SKIP_BACKEND=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev)          MODE="dev"; shift ;;
    --tunnel)       TUNNEL=1; shift ;;
    --skip-backend) SKIP_BACKEND=1; shift ;;
    --backend-dir)  BACKEND_DIR="$2"; shift 2 ;;
    --port)         WEB_PORT="$2"; shift 2 ;;
    --backend-port) BACKEND_PORT="$2"; shift 2 ;;
    -h|--help)      grep '^#' "$0" | grep -v '^#!' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Argumen tidak dikenal: $1"; exit 1 ;;
  esac
done

if [[ -z "$BACKEND_DIR" && $SKIP_BACKEND -eq 0 ]]; then
  guess="$(dirname "$WEB_DIR")/ayam-counter-web"
  [[ -d "$guess" ]] && BACKEND_DIR="$guess"
fi

mkdir -p "$LOG_DIR"

log()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;36m[✓]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[✗]\033[0m %s\n' "$*" >&2; exit 1; }

port_open() { curl -fsS -o /dev/null -m 2 "http://127.0.0.1:$1$2" 2>/dev/null; }

wait_port() { # $1=port $2=path $3=timeout_s $4=nama
  local deadline=$((SECONDS + $3))
  while (( SECONDS < deadline )); do
    port_open "$1" "$2" && return 0
    sleep 1
  done
  die "$4 tidak merespons di port $1 setelah $3 dtk (cek $LOG_DIR)"
}

# ---------------------------------------------------------------------------
# 1. Backend Flask (:5000)
# ---------------------------------------------------------------------------
if [[ $SKIP_BACKEND -eq 0 && -n "$BACKEND_DIR" && -f "$BACKEND_DIR/app/app.py" ]]; then
  if port_open "$BACKEND_PORT" "/api/device"; then
    ok "Backend sudah jalan di :$BACKEND_PORT — tidak di-start ulang"
  else
    PY="$BACKEND_DIR/.venv/bin/python"
    [[ -x "$PY" ]] || PY="$(command -v python3)"
    log "Start backend: $PY -m app.app (port $BACKEND_PORT)..."
    ( cd "$BACKEND_DIR" \
      && PYTHONPATH="$BACKEND_DIR/app" DEVICE="${DEVICE:-auto}" \
         nohup "$PY" -m app.app > "$LOG_DIR/backend.log" 2>&1 & echo $! > "$LOG_DIR/backend.pid" )
    log "Menunggu backend sehat (load model YOLO bisa 10-60 dtk)..."
    wait_port "$BACKEND_PORT" "/api/device" 90 "Backend"
    ok "Backend hidup (PID $(cat "$LOG_DIR/backend.pid"))"
  fi
else
  warn "Backend dilewati (folder tidak ada / --skip-backend) — dashboard akan tampil Offline sampai backend ada"
fi

# ---------------------------------------------------------------------------
# 2. Dashboard Next.js (:3000)
# ---------------------------------------------------------------------------
[[ -n "$RUNNER" ]] || die "node/bun tidak ditemukan — install Node.js dulu"

if port_open "$WEB_PORT" "/"; then
  ok "Dashboard sudah jalan di :$WEB_PORT — tidak di-start ulang"
else
  if [[ "$MODE" == "prod" ]]; then
    [[ -f "$WEB_DIR/.next/standalone/server.js" ]] \
      || die "Belum build. Jalankan: bash $SCRIPT_DIR/install.sh (atau pakai --dev)"
    log "Start dashboard (produksi, port $WEB_PORT)..."
    ( cd "$WEB_DIR/.next/standalone" \
      && NODE_ENV=production PORT="$WEB_PORT" HOSTNAME=0.0.0.0 \
         nohup "$RUNNER" server.js > "$LOG_DIR/web.log" 2>&1 & echo $! > "$LOG_DIR/web.pid" )
  else
    log "Start dashboard (dev, port $WEB_PORT)..."
    ( cd "$WEB_DIR" && nohup "$RUNNER" run dev > "$LOG_DIR/web.log" 2>&1 & echo $! > "$LOG_DIR/web.pid" )
  fi
  wait_port "$WEB_PORT" "/" 120 "Dashboard"
  ok "Dashboard hidup (PID $(cat "$LOG_DIR/web.pid"))"
fi

# ---------------------------------------------------------------------------
# 3. Cloudflared tunnel (opsional)
# ---------------------------------------------------------------------------
TUNNEL_URL=""
if [[ $TUNNEL -eq 1 ]]; then
  CF="$WEB_DIR/bin/cloudflared"
  [[ -x "$CF" ]] || CF="$(command -v cloudflared || true)"
  if [[ -z "$CF" ]]; then
    warn "cloudflared belum ada — unduh dulu: bash $SCRIPT_DIR/install.sh --with-cloudflared"
  else
    log "Start cloudflared quick tunnel → http://localhost:$WEB_PORT ..."
    nohup "$CF" tunnel --url "http://127.0.0.1:$WEB_PORT" --no-autoupdate \
      > "$LOG_DIR/cloudflared.log" 2>&1 & echo $! > "$LOG_DIR/cloudflared.pid"

    # URL trycloudflare muncul di log beberapa detik setelah handshake
    for _ in $(seq 1 45); do
      TUNNEL_URL="$(grep -Eo 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$LOG_DIR/cloudflared.log" | head -1 || true)"
      [[ -n "$TUNNEL_URL" ]] && break
      sleep 1
    done
    if [[ -n "$TUNNEL_URL" ]]; then
      echo "$TUNNEL_URL" > "$LOG_DIR/tunnel-url.txt"
      ok "Tunnel aktif: $TUNNEL_URL  (tersimpan di logs/tunnel-url.txt)"
    else
      warn "URL tunnel belum terbaca — cek $LOG_DIR/cloudflared.log"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Ringkasan
# ---------------------------------------------------------------------------
cat <<EOF

============================================================
 AYAM COUNTER BERJALAN
============================================================
 Dashboard (lokal) : http://localhost:$WEB_PORT
 Backend           : http://localhost:$BACKEND_PORT  $( [[ -f "$LOG_DIR/backend.pid" ]] && echo "(PID $(cat "$LOG_DIR/backend.pid"))" || echo "(eksternal)" )
${TUNNEL_URL:+ Tunnel publik   : $TUNNEL_URL
} Log              : $LOG_DIR
 Stop semua        : bash $SCRIPT_DIR/stop.sh
============================================================
EOF
