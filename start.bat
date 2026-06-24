@echo off
title Soliha Baby Shop Server
echo Starting Soliha Baby Shop Server and Telegram Bot...
cd /d "%~dp0"
py -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
pause
