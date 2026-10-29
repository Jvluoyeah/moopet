@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_web.ps1"
if errorlevel 1 pause
