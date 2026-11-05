@echo off
set "CURRENT_DIR=%~dp0"
set "FILE_TO_RUN=setup_windows11.ps1"
cd /d "%CURRENT_DIR%"
powershell -NoExit -Command "Start-Process powershell -ArgumentList '-NoExit', '-Command', 'Set-Location -Path ''%CURRENT_DIR%''; Set-ExecutionPolicy Bypass -Scope Process -Force; .\%FILE_TO_RUN%' -Verb RunAs"