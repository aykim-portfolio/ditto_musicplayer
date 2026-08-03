@echo off
rem 캐시를 끈 개발 서버 (수정 후 F5 만으로 반영됨)
cd /d "%~dp0"
start "" http://localhost:5173
python dev_server.py 5173
