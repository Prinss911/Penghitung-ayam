# Ayam Counter Pro 🐔

Dashboard **penghitungan ayam real-time** berbasis visi komputer: deteksi *shackle*
via **YOLOv8** (backend Flask + OpenCV + Flask-SocketIO), dihitung otomatis,
diekspor ke Excel, dengan riwayat sesi, target harian, grafik capaian mingguan,
gerbang PIN, dan log audit — semuanya bilingual **Indonesia / English**.

```
Browser ──▶ Dashboard Next.js (:3000) ──rewrite──▶ Backend Flask + YOLOv8 (:5000)
             (repo ini)                            ayam-counter-web (sibling)
```

## Fitur

- 🎥 Live video feed MJPEG (canvas renderer, tahan headless/proxy)
- 🔢 Counter real-time via Socket.IO + fallback polling REST
- ✏️ Koreksi manual +1/−1 saat sesi berjalan (proteksi PIN)
- 🎯 Target harian: progress bar, toast + notifikasi browser saat tercapai
- 📊 Grafik capaian 7 hari (recharts) + ringkasan capaian target
- 📈 Riwayat sesi: filter teks/tanggal, detail per sesi, hapus (PIN)
- 📥 Ekspor Excel/CSV + laporan PDF harian & rentang tanggal
- 🌗 Tema gelap/terang tanpa flash + 🌐 toggle bahasa ID/EN (persist)

## Stack

| Lapisan | Teknologi |
|---|---|
| Framework | Next.js 16 (App Router, standalone output) + React 19 |
| Styling | **Tailwind CSS v4 (CSS-first, `@theme inline` + token oklch)** — tanpa `tailwind.config.ts` |
| Komponen | shadcn/ui (Radix) + lucide-react |
| Animasi | framer-motion + tw-animate-css |
| Chart | recharts |
| Notifikasi | sonner + Notification API + WebAudio beep |
| DB | Prisma + SQLite |

## Menjalankan

```bash
npm install          # atau: npm ci (install reproducible dari package-lock.json)
npm run dev          # dev server di :3000 (backend Flask harus jalan di :5000)
npm run build        # build produksi standalone
npm run start        # jalankan .next/standalone/server.js
```

> Skrip `build` memakai `cp` (Unix). Di Windows gunakan
> [`deploy/windows/`](deploy/windows/) (menyalin manual via PowerShell)
> atau jalankan dari Git Bash/WSL.

## Arsitektur UI & Theming

- **Satu halaman dashboard** (`src/app/page.tsx`) + modul di `src/components/ayam/`
  (hook realtime, video feed, dialog pengaturan/kamera/PIN/audit/riwayat/target).
- **Design system token semantik** (`src/app/globals.css`): semua permukaan UI
  memakai `bg-background` / `bg-card` / `text-foreground` / `text-muted-foreground` /
  `border-border` (token oklch dark & light dari shadcn). Warna aksen
  (amber/emerald/sky/violet/red) sengaja hardcoded sebagai identitas brand.
- **Tema**: class eksklusif `dark` XOR `light` pada `<html>`, diterapkan oleh
  inline script anti-flash di `layout.tsx` (sekaligus init `lang` dari
  `localStorage`) sebelum hydrate. Sisa utilitas zinc lama ditopang oleh
  *remap* variabel di `html.light` sebagai safety net.
- **i18n**: kamus `src/lib/ayam/i18n.ts` (ID/EN), persist `localStorage`
  (`ayam-lang`, `ayam-theme`, `ayam-notif`).

## Deployment

Tiga jalur didukung — Docker, Linux native, Windows native (+ cloudflared tunnel):
lihat **[`deploy/README.md`](deploy/README.md)** (panduan lengkap) dan
[`deploy/windows/README.md`](deploy/windows/README.md) (jalur Windows ⭐).

## Catatan Build & Patch

### Native Binding untuk Windows / Turbopack

`next build` di Windows x64 pernah gagal dengan error `Cannot find native
binding` → `Cannot find module '@tailwindcss/oxide-win32-x64-msvc'`, padahal
file `.node` ada. Penyebabnya: mekanisme resolusi fallback `requireNative()` di
`@tailwindcss/oxide` tidak kompatibel dengan cara Turbopack me-resolve native
addon di Windows.

Solusinya adalah patch lokal via **patch-package**:

- **Patch**: [`patches/@tailwindcss+oxide+4.3.3.patch`](patches/@tailwindcss+oxide+4.3.3.patch)
  — menambah cabang khusus `win32 && x64` yang memuat binding via path absolut
  `path.join(__dirname, '..', 'oxide-win32-x64-msvc', 'tailwindcss-oxide.win32-x64-msvc.node')`.
  Platform lain memakai logika asli tanpa perubahan.
- **Otomatis**: `patch-package` berjalan di `postinstall` — setiap `npm install`
  / `npm ci` langsung menerapkan patch. Tidak perlu dijalankan manual.
- **Validasi**: build produksi sukses dengan patch; CSS Tailwind v4 ter-generate
  utuh (~143 KB, utility classes + warna oklch).

### Single Lockfile (npm)

Dependensi dikelola lewat **npm + [`package-lock.json`](package-lock.json)**
sebagai satu-satunya sumber kebenaran (Tailwind 4.3.3, Next 16.3.3,
React 19.2.8). `bun.lock` lama telah **dihapus** untuk mencegah divergensi
versi antar lockfile.

- `npm ci` — install reproducible persis sesuai lockfile (dipakai semua jalur deploy: Docker, Linux, Windows)
- `npm install` — install/update untuk pengembangan
- Bila terpaksa memakai bun (fallback di mesin tanpa Node): bun akan resolve
  langsung dari `package.json` karena lockfile bun tidak ada — versi bisa
  berbeda dari lockfile.

## Catatan backend

Backend Flask + YOLOv8 (`ayam-counter-web`) berjalan terpisah di port 5000
(model `models/best_shackle.pt`, sumber RTSP CCTV / file video loop).
Dashboard meneruskan `/api/*`, `/video_feed`, `/socket.io/*` via rewrite Next.js
(`BACKEND_ORIGIN`, di-bake saat build — detail di panduan deploy).