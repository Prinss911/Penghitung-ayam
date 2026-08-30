# Panduan Deployment — Ayam Counter

Aplikasi terdiri dari dua komponen:

```
                    ┌──────────────────────────────┐
   Browser / HP ───▶│  Dashboard Next.js  (:3000)  │
                    │  my-project (repo ini)       │
                    └───────────┬──────────────────┘
                                │  rewrite /api/*, /video_feed,
                                │  /socket.io/* (XTransformPort=5000)
                    ┌───────────▼──────────────────┐
                    │  Backend Flask + YOLOv8      │
                    │  ayam-counter-web   (:5000)  │
                    └──────────────────────────────┘
```

Tiga cara deployment yang didukung — pilih satu:

| Platform | Isi folder | Cocok untuk |
|---|---|---|
| **Docker** | [`deploy/docker/`](docker/) | Server/VPS/NAS, isolated, reproducible |
| **Linux native** | [`deploy/linux/`](linux/) | Mini PC / Raspberry-like di sisi kandang |
| **Windows native** | [`deploy/windows/`](windows/) | PC kasir/gudang + **cloudflared tunnel otomatis** |

---

## 0. Konsep penting: `BACKEND_ORIGIN`

Dashboard meneruskan request API ke backend lewat rewrite Next.js ke origin
`http://127.0.0.1:5000` (default — backend satu mesin dengan dashboard).

Nilai ini **di-bake saat `next build`** (standalone Next.js men-serialize config).
Jadi:

- **Deploy native** (Windows/Linux, backend 1 mesin) → tidak perlu apa-apa.
- **Docker compose** → build arg dikirim otomatis (`http://backend:5000`).
- **Dashboard container saja + backend di host** → build dengan
  `--build-arg BACKEND_ORIGIN=http://host.docker.internal:5000`.

---

## 1. Docker

```bash
cd my-project

# A. Dashboard saja (tanpa backend — UI tampil Offline):
docker compose -f deploy/docker/docker-compose.yml up -d web

# B. Dashboard + backend (butuh folder source ayam-counter-web):
bash deploy/docker/setup-backend.sh /path/ke/ayam-counter-web
cp deploy/docker/.env.docker.example deploy/docker/.env   # edit bila perlu
docker compose --profile full -f deploy/docker/docker-compose.yml up -d --build
```

- Dashboard → http://localhost:3000
- Data dashboard (SQLite) bertahan di volume `ayam-web-db`.
- Data backend (video/model/export) di volume `ayam-backend-data`.
- Konfigurasi lengkap: lihat komentar di `deploy/docker/docker-compose.yml`
  dan `deploy/docker/.env.docker.example`.

> Image backend memakai **torch CPU** (~2 GB). Untuk GPU NVIDIA, ubah base image
> di `deploy/docker/Dockerfile.backend` (petunjuk ada di header file).

## 2. Linux

```bash
cd my-project/deploy/linux

# Install + build (otomatis deteksi folder backend sibling ayam-counter-web):
bash install.sh
bash install.sh --backend-dir /path/ayam-counter-web   # lokasi backend lain
bash install.sh --skip-backend                          # dashboard saja
bash install.sh --with-cloudflared                      # + unduh cloudflared

# Jalankan (pilih salah satu):
bash start.sh --tunnel    # backend + dashboard + URL publik cloudflared
bash start.sh             # backend + dashboard saja
sudo systemctl enable --now ayam-web ayam-backend   # bila install --install-systemd

# Stop:
bash stop.sh
```

- URL tunnel tersimpan di `logs/tunnel-url.txt`.
- Untuk service permanen + boot start: `bash install.sh --install-systemd`
  (unit: `systemd/ayam-web.service`, `ayam-backend.service`, `ayam-cloudflared.service`).
- **URL stabil di Linux** (named tunnel):
  ```bash
  cloudflared tunnel login
  cloudflared tunnel create ayam-counter
  cloudflared tunnel route dns ayam-counter dashboard.domainkamu.com
  # sesuaikan ExecStart di systemd/ayam-cloudflared.service → "tunnel run ayam-counter"
  ```

## 3. Windows (dengan cloudflared otomatis) ⭐

Panduan lengkap: **[`deploy/windows/README.md`](windows/README.md)**

```text
1. Double-click  deploy\windows\start-ayam.bat
2. Tunggu sampai muncul:
      URL PUBLIK (tunnel) : https://xxxx-yyyy.trycloudflare.com
3. URL otomatis: tampil di layar, tersimpan di tunnel-url.txt,
   masuk clipboard, dan dibuka di browser.
4. Stop: double-click stop-ayam.bat
```

Yang dilakukan script Windows otomatis:
- venv Python + `pip install` backend (sekali, ada marker `.deps-ok`)
- `npm ci` dependency dashboard dari `package-lock.json` (sekali)
- `next build` + assemble folder `standalone` (Windows tidak punya `cp` →
  disalin via PowerShell) + jalankan `server.js`
- **Unduh cloudflared otomatis** (`%LOCALAPPDATA%\AyamCounter\cloudflared.exe`)
  bila belum ada di PATH
- Quick tunnel + **parsing URL dari log cloudflared**
- Mendukung **named tunnel** via `-TunnelToken` untuk URL permanen

---

## 4. Variabel environment

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port dashboard (standalone Next.js) |
| `HOSTNAME` | `0.0.0.0` | Bind address dashboard |
| `DATABASE_URL` | `file:/app/db/custom.db` (Docker) | SQLite dashboard (Prisma; saat ini belum dipakai fitur) |
| `BACKEND_ORIGIN` | `http://127.0.0.1:5000` | Origin backend — **build-time** (lihat bagian 0) |
| `DEVICE` | `auto` | Device inferensi YOLO: `auto` / `cpu` / `cuda:0` |
| `AYAM_*` | — | Variabel compose (lihat `.env.docker.example`) |

## 5. Troubleshooting umum

| Gejala | Penyebab & solusi |
|---|---|
| Dashboard tampil **Offline** | Backend tidak jalan / `BACKEND_ORIGIN` salah. Cek `curl http://localhost:5000/api/device`. |
| Realtime stuck "Polling" | WebSocket terblokir. Lewat cloudflared WebSocket didukung; bila di belakang proxy lain pastikan `Upgrade`/`Connection` diteruskan. |
| `next build` gagal di Windows saat pakai `npm run build` | Script build memakai `cp` (Unix). **Gunakan `Start-Ayam.ps1`** yang sudah menyalin manual, atau jalankan dari Git Bash/WSL. |
| URL tunnel berubah setiap restart | Memang perilaku quick tunnel. Pakai named tunnel (lihat bagian 2/3). |
| Cloudflared tidak bisa jalan di kantor | Port keluar 7844/UDP+TCP (QUIC/fallback) kadang diblokir firewall korporat. |
| Port 3000/5000 dipakai proses lain | `lsof -i :3000` (Linux) / `netstat -ano \| findstr :3000` (Windows), atau ganti port. |
