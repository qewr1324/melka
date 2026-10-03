@echo off
chcp 65001 >nul
color 0B
echo.
echo ======================================
echo    Melka - Python All-in-One
echo ======================================
echo.

cd /d "%~dp0"

if not exist "venv" (
    echo [*] ساخت محیط مجازی...
    python -m venv venv
    call venv\Scripts\activate
    pip install --upgrade pip
    pip install -r requirements.txt
) else (
    call venv\Scripts\activate
)

echo.
echo [*] اجرای سرور روی http://localhost:3000
echo.

python -m app.main
pause