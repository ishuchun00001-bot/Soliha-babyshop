@echo off
title Soliha Baby Shop - Backend & Bot
echo ===================================================
echo   Soliha Baby Shop Backend va Telegram Bot ishga tushmoqda...
echo ===================================================
echo.
py -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
if %errorlevel% neq 0 (
    echo.
    echo [XATO] Uvicorn ishga tushmadi. Muqobil usulda urinib ko'ramiz...
    py -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
)
pause
