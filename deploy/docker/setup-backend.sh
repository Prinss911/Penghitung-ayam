#!/usr/bin/env bash
# =============================================================================
# setup-backend.sh — siapkan folder source backend (ayam-counter-web)
# untuk build Docker.
#
# Yang dilakukan:
#   1. Validasi struktur folder backend (app/app.py + requirements.txt).
#   2. Salin Dockerfile.backend + .dockerignore dari deploy/docker/ ke folder
#      backend (docker compose membutuhkan Dockerfile berada di dalam context).
#   3. Buat requirements.txt contoh bila belum ada (sesuaikan dengan kebutuhan).
#
# Pemakaian:
#   bash deploy/docker/setup-backend.sh /path/ke/ayam-counter-web
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${1:-}"

if [[ -z "$BACKEND_DIR" ]]; then
  echo "Pemakaian: bash $0 /path/ke/ayam-counter-web"
  exit 1
fi

BACKEND_DIR="$(cd "$BACKEND_DIR" && pwd)"

echo "==> Validasi folder backend: $BACKEND_DIR"

if [[ ! -f "$BACKEND_DIR/app/app.py" ]]; then
  cat <<EOF
[PERINGATAN] $BACKEND_DIR/app/app.py tidak ditemukan.
Pastikan ini folder source backend yang benar (berisi app/, config.py, dsb.).
EOF
  read -rp "Lanjutkan tetap? [y/N] " jawab
  [[ "$jawab" =~ ^[Yy]$ ]] || exit 1
fi

echo "==> Salin Dockerfile.backend + .dockerignore"
cp "$SCRIPT_DIR/Dockerfile.backend" "$BACKEND_DIR/Dockerfile.backend"
cp "$SCRIPT_DIR/.dockerignore.backend" "$BACKEND_DIR/.dockerignore"

if [[ ! -f "$BACKEND_DIR/requirements.txt" ]]; then
  echo "==> requirements.txt belum ada — membuat contoh (silakan sesuaikan)"
  cp "$SCRIPT_DIR/backend-requirements.example.txt" "$BACKEND_DIR/requirements.txt"
fi

cat <<EOF

Selesai. Build sekarang:
  cd "$BACKEND_DIR"
  docker compose --profile full up -d        # dari folder deploy/docker/
  # atau manual:
  docker build -t ayam-backend "$BACKEND_DIR"
EOF
