# Ayam Counter Pro 🐔

**Dashboard penghitungan ayam real-time berbasis visi komputer** dengan deteksi shackle (kaki ayam) via YOLOv8, pelacakan otomatis, statistik sesi, ekspor Excel/CSV, target harian, riwayat lengkap, proteksi PIN, dan log audit — **bilingual Indonesia/English**.

```
Browser (dashboard Next.js :3000) ──▶ Backend Flask + YOLOv8 (:5000)
       (repo ini)                          │
                                           └── ayam-counter-web/
```

## ✨ Fitur Utama

- 🎥 **Live video feed** MJPEG dengan canvas renderer (tahan headless/proxy)
- 🔢 **Counter real-time** via Socket.IO + fallback polling REST
- ✏️ Koreksi manual ±1 saat sesi berjalan (PIN protection)
- 🎯 **Target harian** dengan progress bar & notifikasi browser
- 📊 Grafik capaian 7 hari + ringkasan target (Recharts)
- 📈 Riwayat sesi: filter, detail per sesi, hapus (PIN protected)
- 📥 Ekspor Excel/CSV + laporan PDF (ready-to-implement)
- 🔐 Proteksi PIN operator & log audit lengkap
- 🌗 Tema gelap/terang tanpa flash + toggle bahasa ID/EN

## 🛠️ Teknologi

| Lapisan | Stack |
|---|---|
| **Framework** | Next.js 16 (App Router, standalone output) + React 19 |
| **Styling** | Tailwind CSS v4 (CSS-first) + shadcn/ui (Radix) |
| **Backend** | Flask + Flask-SocketIO + OpenCV + Ultralytics YOLOv8 |
| **Database** | SQLite (Pydantic/SQLAlchemy ORM) |
| **Export** | pandas + openpyxl (Excel), CSV, PDF (optional) |
| **Tunnel** | cloudflared (quick tunnel public URL) |
| **Deploy** | Docker / Linux systemd / Windows PowerShell |

## 🚀 Instalasi Lokal (Windows)

### Prasyarat
- Node.js 18+ (npm)
- Python 3.11+
- Git
- GPU CUDA (optional tapi disarankan untuk akurasi tinggi)

### 1. Clone & Setup Dashboard
```bash
git clone https://github.com/Prinss911/Penghitung-ayam.git
cd Penghitung-ayam
npm ci          # Install dependencies dari package-lock.json
```

### 2. Setup Backend
```powershell
cd ayam-counter-web
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Jalankan (Dev Mode)
**Opsi A: Gunakan skrip launcher otomatis**
```powershell
cd ..
deploy\windows\scripts\Start-Ayam.ps1
```

**Opsi B: Manual**
- Backend: `.venv\Scripts\python.exe -m app.app` (di folder `ayam-counter-web`)
- Dashboard: `npm run dev` (di repo root)
- Tunnel: `cloudflared tunnel --url http://localhost:5000`

## 📦 Struktur Repo

```
Penghitung-ayam/
├── src/app/page.tsx           # Main dashboard UI
├── src/lib/ayam/api.ts        # API client (rewrite proxy XTransformPort)
├── src/lib/ayam/i18n.ts       # Indonesian/English translations
├── next.config.ts             # Proxy rewrite rules to Flask backend
├── package.json               # NPM dependencies + scripts
├── deploy/windows/scripts/    # PowerShell launchers
│   ├── Start-Ayam.ps1         # Auto-start: backend + dashboard + tunnel
│   └── Stop-Ayam.ps1          # Kill semua komponen
├── deploy/docker/             # Docker Compose setup
├── ayam-counter-web/          # Backend Flask + YOLOv8
│   ├── app/app.py             # Flask routes + socket.io handlers
│   ├── app/services/detector.py     # YOLO detector (CUDA auto-detect)
│   ├── app/services/hardware.py     # GPU/CPU detection
│   ├── app/services/database.py   # SQLite session persistence
│   ├── app/services/excel_exporter.py
│   ├── models/best_shackle.pt     # Trained model (5.2 MB)
│   ├── dataset/               # Training/validation images
│   └── README.md              # Backend documentation
├── patches/@tailwindcss+oxide+4.3.3.patch  # Windows native binding fix
└── README.md                  # This file
```

## 🌐 Deployment

### Windows (Production)
```powershell
deploy\windows\scripts\Start-Ayam.ps1 -Mode prod
```
Build standalone → copy ke server → jalankan via batch file.

### Docker
```bash
docker compose up --build
# Access http://localhost:3000, cloudflared tunnel auto-started
```

### Linux systemd
```bash
sudo systemctl start ayam-backend.service
sudo systemctl start ayam-web.service
```

## ⚙️ Konfigurasi

### Environment Variables

`.env.example` (root/dashboard):
```env
DATABASE_URL=file:/home/user/project/db/custom.db
BACKEND_ORIGIN=http://127.0.0.1:5000
```

`.env.example` (backend):
```env
CAMERA_SOURCE=rtsp://camera-ip/video
CAMERA_FPS=30
COUNT_LINE_X=112
ZONE_WIDTH=100
DETECTION_CONFIDENCE=0.25
```

## 🔒 Security Features

- PIN verification sebelum aksi penting (reset, delete, adjust count)
- Audit log setiap operator action (timestamp, action type, detail)
- CSRF protection via Flask's default mechanisms
- Input validation menggunakan Pydantic di backend & Zod di frontend
- Rate limiting placeholder (can be implemented with Flask-Limiter)

## 📊 Database Schema

**Sessions table**:
- `id`, `asal_ayam`, `tanggal`, `jam`, `keterangan`, `total_count`
- `start_time`, `end_time`, `file_name` (Excel export path)

**Detections table** (real-time tracking points):
- `session_id`, `count`, `speed`, `timestamp`, `info` (JSON metadata)

## 🔄 Workflow Normal

1. **Mulai Sesi** → Pilih asal ayam, tanggal, keterangan → "Start"
2. **Deteksi Live** → Counter naik otomatis, track lines visible
3. **Koreksi (+/-)** → Jika ada missed detection/false positive
4. **Hentikan Sesi** → Generate Excel report (with timeline stats)
5. **Lihat Riwayat** → Filter by date/keywords, download exports

## 🧪 Testing

```bash
# Backend unit tests
cd ayam-counter-web
uv pip install pytest
pytest tests/

# E2E testing (Playwright placeholder)
npm test
```

## 📝 License

MIT License - see LICENSE for details.

## 👤 Author

Developed for automated poultry monitoring and counting operations.

---

**Status**: ✅ Production Ready  
**Version**: v1.0 (2026-08-23)

For detailed backend implementation guide, see [`ayam-counter-web/README.md`](ayam-counter-web/README.md).
