@echo off
rem ============================================================
rem  AYAM COUNTER - Windows Launcher (double-click / run)
rem  Menyalakan: backend Flask + dashboard Next.js + tunnel
rem  cloudflared (URL publik otomatis tampil di layar).
rem ============================================================
title Ayam Counter Launcher
echo.
echo  Menjalankan Ayam Counter (prod + cloudflared)...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-Ayam.ps1" %*
echo.
echo  Jendela ini bisa DITUTUP - aplikasi tetap berjalan di background.
echo  Untuk menghentikan semua: jalankan stop-ayam.bat
echo  URL tunnel tersimpan di file tunnel-url.txt
echo.
pause
