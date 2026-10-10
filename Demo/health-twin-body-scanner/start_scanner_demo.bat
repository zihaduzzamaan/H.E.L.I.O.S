@echo off
echo ============================================================
echo   HELIOS x ASTRODOCX - 3D BIO-TWIN SCANNER DEMO LAUNCHER
echo ============================================================
echo Starting local web server on port 8000...
start "" "http://localhost:8000/index.html"
python -m http.server 8000
pause
