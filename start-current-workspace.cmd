@echo off
cd /d "%~dp0"
set "LATTICE_DATA=%~dp0.lattice-local\qa-session"
python studio_server.py --port 8766 --open
pause
