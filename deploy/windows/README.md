# Deployment Windows — Ayam Counter + Cloudflare Tunnel

Panduan khusus Windows. Script di folder ini menyalakan **backend Flask**, **dashboard
Next.js**, dan **tunnel cloudflared** sekaligus — lalu **URL publik otomatis** ditampilkan,
disimpan, dan di-copy ke clipboard.

---

## 1. Prasyarat (sekali saja)

| Komponen | Cara install | Cek |
|---|---|---|
| **Node.js 20+** atau **bun** | https://nodejs.org atau `powershell -c "irm bun.sh/install.ps1 \| iex"` | `node -v` / `bun -v` |
| **Python 3.10+** | https://python.org — **centang "Add python.exe to PATH"** saat install | `python --version` |
| cloudflared | **Tidak perlu install manual** — script mengunduh otomatis | — |

> Jika ingin install cloudflared manual: unduh dari
> https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
> lalu letakkan di `%LOCALAPPDATA%\AyamCounter\cloudflared.exe` (lokasi yang sama
> dipakai script), atau taruh di folder yang ada di `PATH`.

## 2. Struktur folder yang diharapkan

```
D:\project\
├── my-project\          ← dashboard Next.js (repo ini)
│   └── deploy\windows\  ← script-script di sini
└── ayam-counter-web\    ← backend Flask (opsional; folder sibling)
```

Backend di lokasi lain? Pakai parameter: `-BackendDir "D:\backend\ayam-counter-web"`.

## 3. Menjalankan (cara termudah)

**Double-click `start-ayam.bat`** — selesai. Script otomatis:

1. Membuat venv Python + install dependency backend (hanya saat pertama kali).
2. Install dependency dashboard (hanya saat pertama kali).
3. Build dashboard produksi (mode default `prod`).
4. Menyalakan backend → menunggu model YOLO siap.
5. Menyalakan dashboard → `http://localhost:3000`.
6. Menyalakan **cloudflared quick tunnel** dan menangkap URL publik:

```
================================================
  SEMUA SISTEM BERJALAN
================================================
  Dashboard (lokal) : http://localhost:3000
  URL PUBLIK (tunnel) : https://contoh-acak-words.trycloudflare.com   ← BAGIKAN INI
  Backend            : http://localhost:5000
  Log                : D:\project\my-project\logs
  Stop semua         : scripts\Stop-Ayam.ps1 (atau stop-ayam.bat)
================================================
```

- URL tunnel juga **tersimpan di `tunnel-url.txt`** (root project) dan **di-copy ke clipboard**.
- Browser terbuka otomatis ke URL tunnel (pakai `-NoOpen` untuk mencegah).

## 4. Opsi Start-Ayam.ps1

```powershell
powershell -ExecutionPolicy Bypass -File deploy\windows\scripts\Start-Ayam.ps1 `
  -Mode dev              # dev (next dev) | prod (default, standalone build)
  -Port 3000             # port dashboard
  -BackendPort 5000      # port backend Flask
  -Tunnel auto           # auto (quick tunnel) | off
  -TunnelToken XXXX      # named tunnel (URL stabil, lihat bagian 5)
  -SkipBackend           # dashboard saja (backend sudah jalan di mesin lain)
  -BackendDir "D:\..."   # lokasi folder backend kalau bukan sibling
  -NoOpen                # jangan buka browser otomatis
```

## 5. Quick tunnel vs Named tunnel

| | Quick tunnel (default) | Named tunnel |
|---|---|---|
| Akun Cloudflare | Tidak perlu | Perlu + domain |
| URL | Acak, **berubah tiap restart** | Tetap (mis. `dashboard.domainkamu.com`) |
| Perintah | otomatis oleh script | `-TunnelToken <token>` |

**Mendapat token named tunnel (sekali):**
1. Login https://one.dash.cloudflare.com → **Networks → Tunnels → Create a tunnel**
2. Pilih *Cloudflared* → beri nama (mis. `ayam-counter`)
3. Di halaman install pilih **Windows** → salin bagian token dari perintah
   `cloudflared service install <TOKEN>` (token = dereta panjang setelah `eyJ...`)
4. Jalankan: `Start-Ayam.ps1 -TunnelToken <TOKEN>` → dashboard live di hostname
   yang kamu daftarkan, permanen.

## 6. Menghentikan

- **Double-click `stop-ayam.bat`**, atau
- `powershell -ExecutionPolicy Bypass -File deploy\windows\scripts\Stop-Ayam.ps1`
- `-KeepWeb` = dashboard dibiarkan jalan, hanya tunnel+backend yang dimatikan.

## 7. Log & troubleshooting

| Masalah | Cek / solusi |
|---|---|
| Dashboard tampil **Offline** | Backend belum siap — buka `http://localhost:5000/api/device` langsung; lihat `logs\backend.err.log` |
| `pip install` gagal | Koneksi internet; jalankan ulang `start-ayam.bat` (marker `.deps-ok` belum dibuat) |
| Port 3000/5000 terpakai | Matikan pemakai lama via `stop-ayam.bat`, atau ganti `-Port` |
| URL tunnel tidak muncul | Lihat `logs\cloudflared.err.log`; firewall/antivirus kadang blokir cloudflared → allowlist |
| `running scripts is disabled` | Selalu jalankan via `.bat` (sudah memakai `-ExecutionPolicy Bypass`) |
| Anti-virus menandai cloudflared | File resmi dari GitHub Cloudflare; tambahkan pengecualian |

## 8. Auto-start saat Windows menyala (opsional)

Tekan `Win+R` → `shell:startup` → buat shortcut ke `start-ayam.bat`.
Untuk mode service penuh (bisa juga tanpa login), jalankan cloudflared sebagai
service: `cloudflared service install <TOKEN>` setelah named tunnel dibuat.
