@echo off
rem ============================================================
rem  AYAM COUNTER - Stop semua komponen (tunnel, backend, web)
rem ============================================================
title Ayam Counter - Stop
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Stop-Ayam.ps1" %*
echo.
pause
