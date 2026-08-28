#!/bin/bash
# Launcher untuk Ayam Counter Flask backend (port 5000)
# Project source: /home/z/ayam-counter-web
# Menjalankan app sebagai package module agar:
#   - `import app`  -> package app/ (root, sys.path[0] via -m)
#   - `from config import Config` -> PYTHONPATH app/ dir
cd /home/z/ayam-counter-web || exit 1
export PYTHONPATH="/home/z/ayam-counter-web/app"
export DEVICE=auto
exec /home/z/.venv/bin/python3 -m app.app
