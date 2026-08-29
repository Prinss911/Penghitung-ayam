#Requires -Version 5.1
<#
.SYNOPSIS
  Launcher Ayam Counter untuk Windows — backend Flask + dashboard Next.js
  + tunnel cloudflared otomatis.

.DESCRIPTION
  Urutan kerja:
    1. Cek prasyarat (bun/npm + python).
    2. (Opsional) start backend Flask di folder ayam-counter-web
       (buat venv + pip install bila belum ada).
    3. Start dashboard Next.js (mode prod = build standalone, dev = next dev).
    4. Pastikan cloudflared tersedia (unduh otomatis bila belum ada), lalu
       jalankan tunnel dan TANGKAP URL publik (*.trycloudflare.com) secara
       otomatis — URL ditampilkan, disimpan ke tunnel-url.txt, dan
       (opsional) dibuka di browser.

  Contoh:
    powershell -ExecutionPolicy Bypass -File Start-Ayam.ps1
    powershell -File Start-Ayam.ps1 -Mode dev
    powershell -File Start-Ayam.ps1 -Tunnel off            # tanpa tunnel
    powershell -File Start-Ayam.ps1 -TunnelToken <TOKEN>   # named tunnel (URL stabil)
    powershell -File Start-Ayam.ps1 -SkipBackend           # dashboard saja
    powershell -File Start-Ayam.ps1 -BackendDir "D:\ayam-counter-web"
#>
param(
  [string]$WebDir = "",
  [string]$BackendDir = "",
  [ValidateSet("prod", "dev")]
  [string]$Mode = "prod",
  [int]$Port = 3000,
  [int]$BackendPort = 5000,
  [ValidateSet("auto", "off")]
  [string]$Tunnel = "auto",
  # Token named tunnel (cloudflared tunnel run --token ...). URL = hostname
  # yang sudah didaftarkan di Cloudflare (stabil, tidak berubah-ubah).
  [string]$TunnelToken = "",
  [switch]$SkipBackend,
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Lokasi default
# ---------------------------------------------------------------------------
if (-not $WebDir) {
  # Start-Ayam.ps1 berada di <project>\deploy\windows\scripts\
  $WebDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
}
if (-not $BackendDir -and -not $SkipBackend) {
  $guess = Join-Path (Split-Path $WebDir -Parent) "ayam-counter-web"
  if (Test-Path (Join-Path $guess "app\app.py")) { $BackendDir = $guess }
}

$LogDir = Join-Path $WebDir "logs"
$RunDir = Join-Path $WebDir ".run"
foreach ($d in @($LogDir, $RunDir)) {
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
}

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
function Write-Step([string]$m) { Write-Host "`n==> $m" -ForegroundColor Green }
function Write-Ok  ([string]$m) { Write-Host "  [OK] $m" -ForegroundColor Cyan }
function Write-Warn2([string]$m) { Write-Host "  [!] $m" -ForegroundColor Yellow }
function Write-Die ([string]$m) {
  Write-Host "  [X] $m" -ForegroundColor Red
  exit 1
}

# ---------------------------------------------------------------------------
# Util jaringan / proses
# ---------------------------------------------------------------------------
function Test-Port([int]$p) {
  $c = New-Object System.Net.Sockets.TcpClient
  try {
    $c.Connect("127.0.0.1", $p)
    return $c.Connected
  } catch {
    return $false
  } finally {
    $c.Close()
  }
}

function Wait-Http([string]$url, [int]$timeoutSec) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
      if ($r.StatusCode -lt 500) { return $true }
    } catch { Start-Sleep -Milliseconds 500 }
    Start-Sleep -Milliseconds 700
  }
  return $false
}

function Save-Pid([string]$name, [System.Diagnostics.Process]$proc) {
  Set-Content -Path (Join-Path $RunDir "$name.pid") -Value $proc.Id -Encoding ASCII
}

# ---------------------------------------------------------------------------
# Deteksi tooling
# ---------------------------------------------------------------------------
function Get-PkgRunner {
  $bun = Get-Command bun.exe -ErrorAction SilentlyContinue
  if ($bun) {
    $bunx = Get-Command bunx.exe -ErrorAction SilentlyContinue
    return @{ name = "bun"; bunSource = $bun.Source; bunxSource = if ($bunx) { $bunx.Source } else { $null } }
  }
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) { Write-Die "Tidak menemukan bun maupun node. Install dari https://bun.sh atau https://nodejs.org" }
  return @{ name = "npm"; bunSource = $null; bunxSource = $null }
}

# Return @{ Exe = path; Args = @(arg tambahan, mis. -3 utk py launcher) }
function Get-PythonExe {
  $py = Get-Command python.exe -ErrorAction SilentlyContinue
  if ($py) { return @{ Exe = $py.Source; Args = @() } }
  $pyl = Get-Command py.exe -ErrorAction SilentlyContinue
  if ($pyl) { return @{ Exe = $pyl.Source; Args = @("-3") } }
  return $null
}

# ---------------------------------------------------------------------------
# BACKEND — Flask + YOLOv8 (:5000)
# ---------------------------------------------------------------------------
function Start-Backend {
  if ($SkipBackend) { Write-Warn2 "Backend dilewati (-SkipBackend)"; return }
  if (-not $BackendDir) {
    Write-Warn2 "Folder backend tidak ditemukan (cari '$(Join-Path (Split-Path $WebDir -Parent) 'ayam-counter-web')')"
    Write-Warn2 "Dashboard tetap jalan, tapi angka counting tampil Offline. Pakai -BackendDir <path> bila backend di lokasi lain."
    return
  }
  if (Test-Port $BackendPort) {
    Write-Ok "Backend sudah jalan di port $BackendPort — tidak di-start ulang"
    return
  }

  Write-Step "Menyiapkan backend Flask ($BackendDir)"
  $py = Get-PythonExe
  if (-not $py) { Write-Die "Python tidak ditemukan. Install Python 3.10+ dari https://python.org (centang 'Add to PATH')" }

  $venvDir = Join-Path $BackendDir ".venv"
  $venvPy  = Join-Path $venvDir "Scripts\python.exe"
  if (-not (Test-Path $venvPy)) {
    Write-Ok "Membuat virtual environment (.venv)..."
    & $py.Exe @($py.Args) -m venv $venvDir
    if (-not (Test-Path $venvPy)) { Write-Die "Gagal membuat venv di $venvDir" }
  }

  $marker = Join-Path $venvDir ".deps-ok"
  if (-not (Test-Path $marker)) {
    $req = Join-Path $BackendDir "requirements.txt"
    if (Test-Path $req) {
      Write-Ok "Install dependency backend (sekali saja — torch/ultralytics bisa memakan waktu)..."
      & $venvPy -m pip install --quiet --upgrade pip
      & $venvPy -m pip install --quiet -r $req
      if ($LASTEXITCODE -ne 0) { Write-Die "pip install gagal — periksa koneksi/internet lalu jalankan ulang" }
      New-Item -ItemType File -Force -Path $marker | Out-Null
    } else {
      Write-Warn2 "requirements.txt tidak ditemukan di backend — lewati pip install"
    }
  } else {
    Write-Ok "Dependency backend sudah terpasang (marker .deps-ok)"
  }

  Write-Ok "Start backend di port $BackendPort (load model YOLO bisa 10-60 detik)..."
  $out = Join-Path $LogDir "backend.out.log"
  $err = Join-Path $LogDir "backend.err.log"
  $env:PYTHONPATH = Join-Path $BackendDir "app"
  $env:DEVICE = "auto"
  try {
    $proc = Start-Process -FilePath $venvPy `
      -ArgumentList @("-m", "app.app") `
      -WorkingDirectory $BackendDir -WindowStyle Hidden `
      -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
  } finally {
    Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue
  }
  Save-Pid "backend" $proc

  $healthy = Wait-Http "http://127.0.0.1:$BackendPort/api/device" 120
  if ($healthy) { Write-Ok "Backend hidup (PID $($proc.Id))" }
  else {
    Write-Warn2 "Backend belum sehat setelah 120 dtk — cek log: $err"
    Write-Warn2 "Lanjut menyalakan dashboard (UI akan tampil Offline sampai backend siap)"
  }
}

# ---------------------------------------------------------------------------
# DASHBOARD — Next.js (:3000)
# ---------------------------------------------------------------------------
function Start-Web {
  Write-Step "Menyiapkan dashboard Next.js ($WebDir)"

  $pkg = Get-PkgRunner
  Write-Ok "Package runner: $($pkg.name)"

  # node_modules belum ada → install dulu
  if (-not (Test-Path (Join-Path $WebDir "node_modules"))) {
    Write-Ok "Install dependency dashboard (bun install / npm install)..."
    Push-Location $WebDir
    try {
      if ($pkg.name -eq "bun") { & bun install --frozen-lockfile } else { & npm install }
      if ($LASTEXITCODE -ne 0) { Write-Die "Install dependency gagal" }
    } finally { Pop-Location }
  }

  if (Test-Port $Port) {
    Write-Ok "Port $Port sudah dipakai — asumsi dashboard sudah jalan, tidak di-start ulang"
    return
  }

  $out = Join-Path $LogDir "web.out.log"
  $err = Join-Path $LogDir "web.err.log"

  if ($Mode -eq "dev") {
    Write-Ok "Start dashboard mode DEV di port $Port..."
    Push-Location $WebDir
    try {
      if ($pkg.name -eq "bun") {
        # bunx.exe (atau fallback: bun x) → next dev
        $nextArgs = @("next", "dev", "-p", "$Port")
        if ($pkg.bunxSource) {
          $proc = Start-Process -FilePath $pkg.bunxSource -ArgumentList $nextArgs `
            -WorkingDirectory $WebDir -WindowStyle Hidden `
            -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
        } else {
          $allArgs = @("x") + $nextArgs
          $proc = Start-Process -FilePath $pkg.bunSource -ArgumentList $allArgs `
            -WorkingDirectory $WebDir -WindowStyle Hidden `
            -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
        }
      } else {
        # npx.cmd harus lewat cmd.exe
        $proc = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "npx", "next", "dev", "-p", "$Port") `
          -WorkingDirectory $WebDir -WindowStyle Hidden `
          -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
      }
    } finally { Pop-Location }
  }
  else {
    # ------- PROD: next build → assemble standalone → server.js -------
    Write-Ok "Build produksi (next build) — beberapa menit..."
    Push-Location $WebDir
    try {
      if ($pkg.name -eq "bun") {
        if ($pkg.bunxSource) { & $pkg.bunxSource next build }
        else { & $pkg.bunSource x next build }
      } else {
        & cmd.exe /c "npx next build"
      }
      if ($LASTEXITCODE -ne 0) { Write-Die "next build gagal — periksa output di atas" }
    } finally { Pop-Location }

    $standalone = Join-Path $WebDir ".next\standalone"
    if (-not (Test-Path (Join-Path $standalone "server.js"))) {
      Write-Die ".next\standalone\server.js tidak ditemukan — pastikan next.config.ts punya output: 'standalone'"
    }

    # Package.json build script memakai `cp` (tidak ada di Windows) →
    # salin manual via PowerShell:
    $staticDst = Join-Path $standalone ".next\static"
    $publicDst = Join-Path $standalone "public"
    if (Test-Path $staticDst) { Remove-Item -Recurse -Force $staticDst }
    Copy-Item -Recurse -Force (Join-Path $WebDir ".next\static") $staticDst
    if (Test-Path $publicDst) { Remove-Item -Recurse -Force $publicDst }
    Copy-Item -Recurse -Force (Join-Path $WebDir "public") $publicDst

    Write-Ok "Start server produksi di port $Port..."
    $env:NODE_ENV = "production"
    $env:PORT = "$Port"
    $env:HOSTNAME = "0.0.0.0"

    $nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    $bunExe  = (Get-Command bun.exe  -ErrorAction SilentlyContinue).Source
    if ($nodeExe) {
      $proc = Start-Process -FilePath $nodeExe -ArgumentList @("server.js") `
        -WorkingDirectory $standalone -WindowStyle Hidden `
        -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
    } elseif ($bunExe) {
      $proc = Start-Process -FilePath $bunExe -ArgumentList @("server.js") `
        -WorkingDirectory $standalone -WindowStyle Hidden `
        -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
    } else {
      Write-Die "node/bun tidak ditemukan untuk menjalankan server.js"
    }
  }

  Save-Pid "web" $proc

  if (Wait-Http "http://127.0.0.1:$Port" 180) {
    Write-Ok "Dashboard hidup (PID $($proc.Id)) → http://localhost:$Port"
  } else {
    Write-Die "Dashboard tidak merespons — cek log: $err"
  }
}

# ---------------------------------------------------------------------------
# CLOUDFLARED — tunnel publik otomatis
# ---------------------------------------------------------------------------
function Ensure-Cloudflared {
  # 1) sudah di PATH?
  $cmd = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  # 2) unduhan sebelumnya di %LOCALAPPDATA%\AyamCounter
  $dir = Join-Path $env:LOCALAPPDATA "AyamCounter"
  $exe = Join-Path $dir "cloudflared.exe"
  if (Test-Path $exe) { return $exe }

  # 3) unduh otomatis (release resmi Cloudflare)
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
  Write-Ok "Mengunduh cloudflared (sekali saja, ~60 MB)..."
  Write-Ok "  sumber: $url"
  $ok = $false
  try {
    & curl.exe -fsSL -o $exe $url
    if ($LASTEXITCODE -eq 0) { $ok = $true }
  } catch { }
  if (-not $ok -or -not (Test-Path $exe) -or (Get-Item $exe).Length -lt 10MB) {
    try {
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      Invoke-WebRequest -Uri $url -OutFile $exe -UseBasicParsing
    } catch {
      Write-Die "Gagal mengunduh cloudflared. Unduh manual dari https://developers.cloudflare.com/cloudflare/one-page-docs/cloudflare-one/connections/connect-networks/downloads/ lalu letakkan di $dir"
    }
  }
  return $exe
}

function Start-Tunnel {
  Write-Step "Menyalakan tunnel cloudflared"

  if (-not (Test-Port $Port)) {
    Write-Warn2 "Dashboard belum hidup — tunnel ditunda"
    return $null
  }

  $exe = Ensure-Cloudflared
  Write-Ok "cloudflared: $exe"

  $outLog = Join-Path $LogDir "cloudflared.out.log"
  $errLog = Join-Path $LogDir "cloudflared.err.log"

  if ($TunnelToken) {
    Write-Ok "Mode NAMED TUNNEL (token) — URL = hostname yang didaftarkan di Cloudflare"
    $cfArgs = @("tunnel", "--no-autoupdate", "run", "--token", $TunnelToken)
  } else {
    Write-Ok "Mode QUICK TUNNEL — URL acak *.trycloudflare.com (gratis, tanpa akun)"
    $cfArgs = @("tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:$Port")
  }

  $proc = Start-Process -FilePath $exe -ArgumentList $cfArgs -WindowStyle Hidden `
    -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
  Save-Pid "tunnel" $proc

  $tunnelUrl = $null
  if (-not $TunnelToken) {
    Write-Ok "Menunggu URL tunnel (maks 60 detik)..."
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
      Start-Sleep -Milliseconds 800
      if ($proc.HasExited) { break }
      $txt = ""
      foreach ($f in @($outLog, $errLog)) {
        if (Test-Path $f) { $txt += (Get-Content -Path $f -Raw -ErrorAction SilentlyContinue) }
      }
      if ($txt -match 'https://[a-zA-Z0-9-]+\.trycloudflare\.com') {
        $tunnelUrl = $Matches[0]
        break
      }
    }
  }

  if ($proc.HasExited) {
    Write-Warn2 "cloudflared keluar lebih awal — cek log: $errLog"
    return $null
  }

  # URL disimpan agar mudah dibuka lagi / dibagikan
  $urlFile = Join-Path $WebDir "tunnel-url.txt"
  if ($tunnelUrl) {
    Set-Content -Path $urlFile -Value $tunnelUrl -Encoding ASCII
    Write-Ok "URL tersimpan: $urlFile"
    try { Set-Clipboard -Value $tunnelUrl; Write-Ok "URL sudah di-copy ke clipboard" } catch { }
  }

  return @{ Proc = $proc; Url = $tunnelUrl }
}

# ---------------------------------------------------------------------------
# EKSEKUSI
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "=============================================" -ForegroundColor Magenta
Write-Host "  AYAM COUNTER — Windows Launcher"             -ForegroundColor Magenta
Write-Host "=============================================" -ForegroundColor Magenta
Write-Host "  Web dir    : $WebDir"
Write-Host "  Backend dir: $(if ($BackendDir) { $BackendDir } else { '(tidak ada / dilewati)' })"
Write-Host "  Mode       : $Mode   Port: $Port   Tunnel: $Tunnel"
Write-Host "=============================================" -ForegroundColor Magenta

Start-Backend
Start-Web

$tunnelInfo = $null
if ($Tunnel -eq "auto") { $tunnelInfo = Start-Tunnel }

$localUrl  = "http://localhost:$Port"
$publicUrl = if ($tunnelInfo -and $tunnelInfo.Url) { $tunnelInfo.Url } else { $null }

Write-Host ""
Write-Host "================================================" -ForegroundColor Magenta
Write-Host "  SEMUA SISTEM BERJALAN"                          -ForegroundColor Magenta
Write-Host "================================================" -ForegroundColor Magenta
Write-Host "  Dashboard (lokal) : $localUrl"
if ($publicUrl) {
  Write-Host "  URL PUBLIK (tunnel) : $publicUrl" -ForegroundColor Yellow
  Write-Host "  >> Bagikan URL kuning di atas untuk akses dari internet <<" -ForegroundColor Yellow
}
elseif ($TunnelToken) {
  Write-Host "  Named tunnel aktif (URL = hostname Cloudflare Anda)" -ForegroundColor Yellow
}
Write-Host "  Backend            : http://localhost:$BackendPort"
Write-Host "  Log                : $LogDir"
Write-Host "  Stop semua         : scripts\Stop-Ayam.ps1 (atau stop-ayam.bat)"
Write-Host "================================================" -ForegroundColor Magenta
Write-Host ""

if ($publicUrl -and -not $NoOpen) {
  try { Start-Process $publicUrl } catch { }
}
elseif (-not $publicUrl -and -not $NoOpen) {
  try { Start-Process $localUrl } catch { }
}
