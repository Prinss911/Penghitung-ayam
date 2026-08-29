#Requires -Version 5.1
<#
.SYNOPSIS
  Hentikan semua komponen Ayam Counter di Windows:
  cloudflared (tunnel), backend Flask (:5000), dashboard Next.js (:3000).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File Stop-Ayam.ps1
  powershell -File Stop-Ayam.ps1 -KeepWeb     # dashboard tetap jalan
#>
param(
  [string]$WebDir = "",
  [switch]$KeepWeb
)

$ErrorActionPreference = "SilentlyContinue"

if (-not $WebDir) {
  $WebDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
}
$LogDir = Join-Path $WebDir "logs"
$RunDir = Join-Path $WebDir ".run"

function Write-Ok([string]$m)   { Write-Host "  [OK] $m" -ForegroundColor Cyan }
function Write-Info([string]$m) { Write-Host "==> $m" -ForegroundColor Green }

function Stop-PidFile([string]$name, [string]$label) {
  # PENTING: jangan pakai variabel bernama $pid — itu automatic variable
  # read-only milik PowerShell (ID proses script ini sendiri).
  $file = Join-Path $RunDir "$name.pid"
  if (Test-Path $file) {
    $procId = (Get-Content $file -Raw).Trim()
    if ($procId -match '^\d+$' -and (Get-Process -Id $procId -ErrorAction SilentlyContinue)) {
      Stop-Process -Id $procId -Force
      Write-Ok "$label dihentikan (PID $procId)"
    } else {
      Write-Ok "$label memang sudah mati"
    }
    Remove-Item $file -Force
  }
}

function Stop-PortListener([int]$port, [string]$label) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    if ($p -and $p.Id -ne $PID) {
      Stop-Process -Id $p.Id -Force
      Write-Ok "$label dihentikan via port $port (PID $($p.Id), proses $($p.ProcessName))"
    }
  }
}

Write-Host ""
Write-Info "Menghentikan Ayam Counter..."

# 1) Tunnel paling dulu
Stop-PidFile "tunnel" "Cloudflared tunnel"
Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" |
  Where-Object { $_.CommandLine -match 'tunnel' } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force
    Write-Ok "Cloudflared tunnel dihentikan (PID $($_.ProcessId))"
  }

# 2) Backend Flask
Stop-PidFile "backend" "Backend Flask"
Stop-PortListener 5000 "Backend Flask"

# 3) Dashboard
if ($KeepWeb) {
  Write-Ok "Dashboard dibiarkan jalan (-KeepWeb)"
} else {
  Stop-PidFile "web" "Dashboard Next.js"
  Stop-PortListener 3000 "Dashboard Next.js"
}

Write-Host ""
Write-Host "Selesai. Log tersimpan di: $LogDir" -ForegroundColor Yellow
Write-Host ""
