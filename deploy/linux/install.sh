#!/usr/bin/env bash
# =============================================================================
# install.sh — installer Ayam Counter untuk Linux
#
# Melakukan:
#   1. Cek prasyarat (node, python3, curl)
#   2. Install dependency dashboard (npm ci) + prisma generate
#   3. Build dashboard produksi (standalone)
#   4. (Opsional) siapkan venv + dependency backend Flask bila folder backend ada
#   5. (Opsional) install systemd unit   : ./install.sh --install-systemd
#   6. (Opsional) unduh cloudflared      : ./install.sh --with-cloudflared
#
# Pemakaian:
#   bash install.sh                          # build dashboard + backend (bila ada)
#   bash install.sh --backend-dir /path/ayam-counter-web
#   bash install.sh --skip-backend           # dashboard saja
#   bash install.sh --install-systemd        # + daftarkan systemd service
#   bash install.sh --with-cloudflared       # + unduh cloudflared ke bin/
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

BACKEND_DIR="${AYAM_BACKEND_DIR:-}"
INSTALL_SYSTEMD=0
WITH_CLOUDFLARED=0
SKIP_BACKEND=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend-dir)      BACKEND_DIR="$2"; shift 2 ;;
    --skip-backend)     SKIP_BACKEND=1; shift ;;
    --install-systemd)  INSTALL_SYSTEMD=1; shift ;;
    --with-cloudflared) WITH_CLOUDFLARED=1; shift ;;
    -h|--help)
      grep '^#' "$0" | grep -v '^#!' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Argumen tidak dikenal: $1"; exit 1 ;;
  esac
done

# Default backend: folder sibling "ayam-counter-web" di samping project web
if [[ -z "$BACKEND_DIR" && $SKIP_BACKEND -eq 0 ]]; then
  guess="$(dirname "$WEB_DIR")/ayam-counter-web"
  [[ -d "$guess" ]] && BACKEND_DIR="$guess"
fi

log()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[✗]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. Prasyarat
# ---------------------------------------------------------------------------
log "Cek prasyarat..."

PKG=""
if command -v npm >/dev/null 2>&1; then PKG="npm";
elif command -v bun >/dev/null 2>&1; then PKG="bun";
else die "npm (Node.js) tidak ditemukan. Install dulu: https://nodejs.org"
fi

command -v python3 >/dev/null 2>&1 || warn "python3 tidak ditemukan — backend tidak bisa dijalankan di mesin ini"
command -v curl    >/dev/null 2>&1 || die "curl wajib ada (untuk health check)"
echo "    pkg runner : $PKG ($( $PKG --version 2>/dev/null | head -1 ))"
echo "    web dir    : $WEB_DIR"
[[ -n "$BACKEND_DIR" ]] && echo "    backend dir: $BACKEND_DIR"

# ---------------------------------------------------------------------------
# 2. Dependency dashboard
# ---------------------------------------------------------------------------
log "Install dependency dashboard ($PKG)..."
cd "$WEB_DIR"
if [[ "$PKG" == "bun" ]]; then
  # Fallback langka (mesin tanpa npm): bun.lock sudah dihapus →
  # bun resolve langsung dari package.json.
  warn "Memakai bun tanpa lockfile (bun.lock sudah dihapus) — versi bisa beda dari package-lock.json"
  bun install
else
  if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
fi

log "Prisma generate (aman walau tidak dipakai)..."
if [[ "$PKG" == "npm" ]]; then
  npx prisma generate || warn "prisma generate gagal (diabaikan)"
else
  bunx prisma generate || warn "prisma generate gagal (diabaikan — dashboard tidak memakai DB lokal)"
fi

# ---------------------------------------------------------------------------
# 3. Build produksi (standalone)
# ---------------------------------------------------------------------------
log "Build dashboard produksi (next build, standalone)..."
if [[ "$PKG" == "npm" ]]; then
  npm run build
else
  bun run build
fi
[[ -f .next/standalone/server.js ]] || die "Build selesai tapi .next/standalone/server.js tidak ada"
log "Build OK → $WEB_DIR/.next/standalone"

# ---------------------------------------------------------------------------
# 4. Backend (opsional)
# ---------------------------------------------------------------------------
if [[ $SKIP_BACKEND -eq 0 && -n "$BACKEND_DIR" ]]; then
  if [[ ! -f "$BACKEND_DIR/app/app.py" ]]; then
    warn "Backend tidak ditemukan di $BACKEND_DIR (butuh app/app.py) — dilewati"
  else
    log "Siapkan venv backend..."
    cd "$BACKEND_DIR"
    [[ -d .venv ]] || python3 -m venv .venv
    ./.venv/bin/pip install --upgrade pip -q
    if [[ -f requirements.txt ]]; then
      log "Install dependency backend (requirements.txt) — torch/ultralytics bisa lama..."
      ./.venv/bin/pip install -r requirements.txt
    else
      warn "requirements.txt tidak ada di backend — lewati pip install"
    fi
    log "Backend siap → $BACKEND_DIR"
  fi
fi

# ---------------------------------------------------------------------------
# 5. systemd (opsional)
# ---------------------------------------------------------------------------
if [[ $INSTALL_SYSTEMD -eq 1 ]]; then
  log "Install systemd unit (butuh sudo)..."
  command -v systemctl >/dev/null 2>&1 || die "systemctl tidak ditemukan — bukan distro systemd?"

  RUNNER="$(command -v node || command -v bun)"
  sed -e "s|@WEB_DIR@|$WEB_DIR|g" -e "s|@RUNNER@|$RUNNER|g" \
    "$SCRIPT_DIR/systemd/ayam-web.service" > /tmp/ayam-web.service
  sudo cp /tmp/ayam-web.service /etc/systemd/system/ayam-web.service

  if [[ -n "$BACKEND_DIR" && -f "$BACKEND_DIR/app/app.py" ]]; then
    sed -e "s|@BACKEND_DIR@|$BACKEND_DIR|g" -e "s|@USER@|$(id -un)|g" \
      "$SCRIPT_DIR/systemd/ayam-backend.service" > /tmp/ayam-backend.service
    sudo cp /tmp/ayam-backend.service /etc/systemd/system/ayam-backend.service
  else
    warn "Backend tidak ada — unit ayam-backend.service dilewati"
  fi

  sudo systemctl daemon-reload
  log "systemd terpasang. Jalankan:  sudo systemctl enable --now ayam-web ayam-backend"
fi

# ---------------------------------------------------------------------------
# 6. cloudflared (opsional)
# ---------------------------------------------------------------------------
if [[ $WITH_CLOUDFLARED -eq 1 ]]; then
  log "Unduh cloudflared (linux amd64)..."
  mkdir -p "$WEB_DIR/bin"
  curl -fL -o "$WEB_DIR/bin/cloudflared" \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod +x "$WEB_DIR/bin/cloudflared"
  "$WEB_DIR/bin/cloudflared" --version
fi

cat <<EOF

============================================================
 INSTALASI SELESAI
============================================================
 Jalankan aplikasi :
   bash $SCRIPT_DIR/start.sh            # backend + dashboard (prod)
   bash $SCRIPT_DIR/start.sh --tunnel   # + tunnel cloudflared (URL publik)
   bash $SCRIPT_DIR/stop.sh             # hentikan semua

 Buka dashboard     : http://localhost:3000
============================================================
EOF
