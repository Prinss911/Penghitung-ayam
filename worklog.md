# Worklog — Ayam Counter Pro

---

Task ID: 1
Agent: Z.ai Code (main)
Date: 2026-08-28
Task: Unduh project dari gofile (https://gofile.io/d/D7wNOPjz), ekstrak, jalankan backend Flask + YOLOv8 sebagai mini-service, dan bangun dashboard Next.js bilingual di port 3000.

Work Log:
- Download gofile via API (guest account + intercept download URL dari headless browser): `ayam-counter-web-FINAL-bilingual-2026-08-23_03-25-28.zip` (240 MB) → diekstrak ke `/home/z/ayam-counter-web`.
- Analisis project: sistem penghitung ayam real-time (YOLOv8 + Flask + Flask-SocketIO + OpenCV), sumber RTSP CCTV, model `models/best_shackle.pt`, kelas: Shackle-Detection 2 (berisi) & 3 (kosong).
- Install dependencies Python 3.12 di venv `/home/z/.venv`: torch 2.13.0+cpu, torchvision 0.28.0+cpu, ultralytics, opencv-python-headless 4.13, flask 3, flask-socketio, python-socketio, pandas, openpyxl, numpy 2.1.3.
- Fix CRLF → LF pada seluruh file .py + template (file asli Windows line endings).
- Fix import legacy: `modules.simple_counter` → `app.services.simple_counter`, `from config` → `from app.config` (hybrid_counter, tracker, direct_counter, camera). `modules/` lama sudah kosong.
- Update `.env`: CAMERA_SOURCE → `/home/z/ayam-counter-web/video_shackle_berisi.mp4` (RTSP 192.168.1.70 tidak dapat dijangkau di sandbox; video diputar loop sebagai demo).
- Perbaikan `app/app.py`:
  - `capture_thread()`: pacing FPS untuk sumber file video + loop ulang otomatis saat video habis + status `camera_connected`.
  - Tambahan REST API: `/api/device` (profil hardware + status kamera/model), `/api/history`, `/api/session/start`, `/api/session/stop`, `/api/reset` (untuk frontend Next.js via gateway).
  - Refactor: `_do_start_session()` / `_do_stop_session()` dipakai bersama SocketIO & REST.
  - `_drain_frame_queue()` saat start/stop mencegah frame sisa terhitung.
- Perbaikan `database.py`: tambah `add_session()` agar riwayat sesi benar-benar tersimpan (sebelumnya tidak pernah di-insert).
- Backend dijalankan sebagai mini-service: `/home/z/my-project/mini-services/ayam-backend/` (start.sh menjalankan `python3 -m app.app` dari project root dengan PYTHONPATH app dir, port 5000, log: `/home/z/ayam-backend.log`).
- Frontend Next.js baru (menggantikan template Flask):
  - `src/lib/ayam/i18n.ts` — kamus bilingual ID/EN lengkap.
  - `src/lib/ayam/api.ts` — API client (semua request relative + `XTransformPort=5000` untuk gateway Caddy).
  - `src/components/ayam/use-ayam-dashboard.ts` — hook: SocketIO realtime (`io('/?XTransformPort=5000', {path:'/socket.io/', query:{XTransformPort:'5000'}})`) + fallback/sinkron polling REST tiap 2s.
  - `src/components/ayam/video-feed.tsx` — renderer MJPEG via canvas + fetch streaming (SOI/EOI JPEG parser). `<img>` multipart hitam di headless Chromium; canvas 100% andal.
  - `src/app/page.tsx` — dashboard lengkap: header sticky (badge koneksi, toggle ID/EN), 4 stat cards, video feed live, panel kontrol sesi (form asal/tanggal/jam/keterangan, tombol Mulai/Hentikan/Reset), kartu ringkasan harian, info hardware, daftar ekspor Excel + unduh, tabel riwayat sesi, footer sticky (mt-auto + safe-area).
- `bun run lint` → 0 error 0 warning.

Stage Summary:
- Backend Flask (port 5000): ✅ running, model YOLO loaded (CPU FP32, verified), video loop berjalan.
- Gateway Caddy (port 81): ✅ `XTransformPort` → 5000 berfungsi untuk REST, MJPEG, dan WebSocket SocketIO.
- Frontend (port 3000): ✅ dashboard terverifikasi via agent-browser pada 1440x900 & 390x844.
- Golden path terverifikasi end-to-end: Mulai sesi → deteksi YOLO live (bbox + confidence di video) → counter real-time via socket (frontend = overlay video, 14→23 ayam) → Hentikan → Excel tersimpan (`ayam_Farm Citayam 07_...xlsx`) → riwayat masuk SQLite → UI refresh.
- Bahasa ID/EN berfungsi; reset counter berfungsi; ekspor dapat diunduh via gateway.

Arsitektur:
```
Browser → Caddy :81 (preview)
  ├── /                     → Next.js :3000 (dashboard UI)
  └── /api/*, /video_feed,  → Flask :5000 (YOLOv8 detection + SocketIO)
      /socket.io/  (query XTransformPort=5000)
```

Catatan penting untuk agen berikutnya:
- `<img>` untuk MJPEG tampil hitam di headless Chromium (data ada di bitmap tapi tidak di-paint). SELALU gunakan komponen `VideoFeed` (canvas + fetch streaming) untuk video.
- Sumber kamera di sandbox adalah file video loop (`video_shackle_berisi.mp4`, 978x660). Untuk produksi, kembalikan `.env` CAMERA_SOURCE ke RTSP Dahua.
- Restart backend: `pkill -f "app.app"` lalu `cd /home/z/my-project/mini-services/ayam-backend && bash start.sh` (background).
- Jangan jalankan `bun run build` (sandbox); gunakan dev server.
- Count line X=112, zone width=100, confidence 0.25 (bisa diubah via .env).

Ide pengembangan berikutnya (prioritas):
1. Halaman/panel pengaturan runtime (ubah count line, zone, confidence dari UI + simpan ke .env).
2. Grafik tren penghitungan per jam (recharts) dari data sesi.
3. Mode deteksi file video upload (selain kamera/loop).
4. Notifikasi suara/visual saat count milestone.
5. Export CSV selain Excel; filter riwayat berdasarkan tanggal.
6. Dark/light theme toggle (next-themes sudah tersedia).

---

Task ID: 2
Agent: Z.ai Code (cron webDevReview ronde 2)
Date: 2026-08-28
Task: QA berkala + pengembangan fitur baru (pengaturan runtime, grafik, milestone, filter riwayat, CSV, styling polish).

Work Log:
- QA awal: layanan sehat (Flask :5000, Next.js :3000, gateway :81), dashboard live video OK, tanpa error console.
- BACKEND (app/app.py):
  - `GET/POST /api/settings` — confidence, count_line_x, zone_width; POST langsung mengubah Config + counter + detector (live-apply tanpa restart) dan persist ke `.env` via `_update_env_file()`.
  - `GET /api/timeline` — timeline kumulatif sesi berjalan dari `counter.count_history` (elapsed detik + total) untuk grafik.
  - `GET /api/download/csv/<filename>` — konversi xlsx → CSV on-the-fly via pandas.
- FRONTEND:
  - `settings-dialog.tsx` — dialog Pengaturan Deteksi (3 slider: confidence 5–95%, garis hitung 0–480px, zona 10–300px; badge nilai, hint teks, indikator dirty, toast sukses/gagal).
  - `session-trend-chart.tsx` — AreaChart recharts (gradasi amber) tren kumulatif + badge LIVE saat sesi aktif.
  - Grafik "Ringkasan 7 Hari" — BarChart biru total ayam/hari (agregasi dari riwayat) + badge Sesi Hari Ini & Ayam Hari Ini.
  - `animated-number.tsx` — angka count-up easeOutCubic (rAF) untuk kartu total.
  - Milestone: toast + beep WebAudio setiap kelipatan 10 ayam (sinkron reset saat sesi baru/reset).
  - Riwayat: pencarian asal ayam + filter tanggal + badge jumlah hasil + tombol "tampilkan semua".
  - Ekspor: tombol unduh CSV (ikon FileDown) di tiap baris + badge jumlah file.
  - Styling: animasi masuk framer-motion bertahap per section, hover lift + glow shadow per-aksen pada stat card, top gradient line, ikon scale on hover.
  - Bahasa dipersist ke localStorage (`ayam-lang`) — tidak reset saat reload.
- Verifikasi agent-browser: dialog settings (ubah 25%→35%→terapkan→backend `confidence:0.35` + .env tertulis → dikembalikan 0.25); sesi penuh Kandang Rondomestik = 31 ayam tercatat, Excel 7.2KB tersimpan, riwayat 4 sesi; filter "farm" → 2 hasil; grafik tren & 7-hari tampil benar; EN/ID + persist OK; lint 0 error.
- Bersih-bersih: hapus sesi liar "Unknown" (file xlsx + baris DB) akibat klik test yang meleset.

Temuan & perbaikan kecil:
- `agent-browser find --name "EN"` ternyata cocok substring ke tombol lain (membuka dialog Pengaturan secara tak sengaja). Pelajaran: untuk nama pendek, gunakan eval DOM click dengan exact match (`textContent.trim()==='EN'`).
- Tombol X dialog Radix tidak punya `aria-label="Close"` (accessible name dari sr-only span) — gunakan Escape untuk menutup via otomasi.

Stage Summary:
- Semua layanan sehat; lint bersih; dashboard v2.1 dengan 6 fitur baru terverifikasi end-to-end.
- Backend: 3 endpoint baru (/api/settings GET+POST, /api/timeline, /api/download/csv) — semuanya teruji via curl & UI.
- Data uji di DB: 3 sesi (TEST-FARM 7, Farm Citayam 07 23, Kandang Rondomestik 31).

Risiko / catatan:
- Saat restart backend, grafik tren sesi hilang (in-memory by design); riwayat & ekspor tetap aman di SQLite/Excel.
- Nilai .env sekarang: CONFIDENCE_THRESHOLD=0.25, COUNT_LINE_POSITION=112, ZONE_WIDTH=100 (dipulihkan setelah pengujian).
- Bahasa disimpan di localStorage browser sandbox — preview user baru mulai dari ID.

Rekomendasi ronde berikutnya (prioritas):
1. Halaman detail sesi (klik baris riwayat → detail deteksi per menit + grafik).
2. Deteksi file video upload (mode demo selain loop).
3. Theme light/dark toggle (next-themes).
4. Notifikasi browser (Notification API) untuk milestone saat tab di background.
5. Auto-refresh pengaturan di kartu Backend saat diubah dari dialog (saat ini perlu reload halaman untuk refresh confidence di kartu).
