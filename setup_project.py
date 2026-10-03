"""
Melka - ساختار پروژه Python All-in-One
اجرا: python setup_project.py
"""

import os
from pathlib import Path

BASE = Path("python-all-in-one")

# پوشه‌ها
DIRS = [
    "app",
    "app/detectors",
    "app/filters",
    "app/render",
    "app/utils",
    "static",
    "static/three",
    "uploads",
    "renders",
    "data",
]

# فایل‌های __init__.py
INIT_FILES = [
    "app/__init__.py",
    "app/detectors/__init__.py",
    "app/filters/__init__.py",
    "app/render/__init__.py",
    "app/utils/__init__.py",
]

# فایل‌های اصلی
FILES = {
    "requirements.txt": """fastapi==0.115.0
uvicorn[standard]==0.32.0
python-multipart==0.0.12
opencv-python-headless==4.10.0.84
numpy==2.1.3
pillow==11.0.0
""",
    "run.sh": """#!/bin/bash

RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
BLUE='\\033[0;34m'
NC='\\033[0m'

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}   🏠 Melka - نسخه Python All-in-One${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"

# بررسی venv
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}📦 ساخت محیط مجازی...${NC}"
    python3 -m venv venv
    source venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

echo -e "${GREEN}✅ محیط آماده است${NC}"
echo -e "${BLUE}🚀 اجرای سرور روی http://localhost:3000${NC}"
echo ""

python -m app.main
""",
    "run.bat": """@echo off
chcp 65001 >nul
color 0B
echo.
echo ======================================
echo    Melka - Python All-in-One
echo ======================================
echo.

if not exist "venv" (
    echo [*] ساخت محیط مجازی...
    python -m venv venv
    call venv\\Scripts\\activate
    pip install --upgrade pip
    pip install -r requirements.txt
) else (
    call venv\\Scripts\\activate
)

echo.
echo [*] اجرای سرور روی http://localhost:3000
echo.

python -m app.main
pause
""",
    "README.md": """# 🏠 Melka - Python All-in-One

نقشه‌ساز خانه با تشخیص هوشمند خطوط و پله از روی عکس پلان.

## 📦 نصب

```bash
# ویندوز
run.bat

# لینوکس / مک
chmod +x run.sh
./run.sh