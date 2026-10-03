#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}   🏠 Melka - Python All-in-One${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"

# بررسی پورت 3000
if command -v lsof >/dev/null 2>&1; then
    PIDS=$(lsof -ti :3000 2>/dev/null)
    if [ -n "$PIDS" ]; then
        echo -e "${YELLOW}⏹  خاموش کردن سرور قبلی روی پورت 3000...${NC}"
        echo "$PIDS" | xargs kill -9 2>/dev/null
        sleep 1
    fi
fi

# ═══════════════════════════════════════
# ساخت یا بازسازی venv
# ═══════════════════════════════════════
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}📦 ساخت محیط مجازی...${NC}"
    python3 -m venv venv
fi

# فعال‌سازی
source venv/bin/activate

# ✅ چک کن که پکیج‌های اصلی نصب هستن یا نه
NEED_INSTALL=0
python -c "import fastapi" 2>/dev/null || NEED_INSTALL=1
python -c "import uvicorn" 2>/dev/null || NEED_INSTALL=1
python -c "import cv2" 2>/dev/null || NEED_INSTALL=1
python -c "import PIL" 2>/dev/null || NEED_INSTALL=1
python -c "import numpy" 2>/dev/null || NEED_INSTALL=1

if [ "$NEED_INSTALL" = "1" ]; then
    echo -e "${YELLOW}📦 نصب پکیج‌های مورد نیاز...${NC}"
    pip install --upgrade pip
    pip install -r requirements.txt
fi

echo -e "${GREEN}✅ محیط آماده است${NC}"
echo -e "${BLUE}🚀 اجرای سرور روی http://localhost:3000${NC}"
echo ""

# اجرا (با پایتون داخل venv)
python -m app.main