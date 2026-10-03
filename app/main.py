"""Melka - سرور اصلی پروژه (All-in-One Python)"""

import os
import time
import json
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.config import (
    UPLOAD_DIR, RENDER_DIR, DATA_DIR, STATIC_DIR,
    HOST, PORT, MAX_FILE_SIZE,
)
from app.detectors.line_detector import detect_lines
from app.detectors.stair_detector import detect_stairs
from app.filters.stair_filter import filter_stair_lines
from app.render.renderer import render_plan


# ═══════════════════════════════════════════════
# اپ اصلی
# ═══════════════════════════════════════════════
app = FastAPI(title="Melka Editor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═══════════════════════════════════════════════
# Pydantic Models
# ═══════════════════════════════════════════════
class DetectRequest(BaseModel):
    filename: str


class ReRenderRequest(BaseModel):
    lines: list = []
    stairs: list = []
    rooms: list = []
    doors: list = []
    windows: list = []
    texts: list = []
    arrows: list = []
    rects: list = []
    circles: list = []
    compass: dict = None
    layers: dict = None
    style: str = "modern"
    title: str = ""
    imageWidth: int = 1000
    imageHeight: int = 700


class SavePlanRequest(BaseModel):
    objects: list = []
    stairs: list = []
    imageWidth: int = 1000
    imageHeight: int = 700
    style: str = "modern"
    title: str = ""
    compass: dict = None


# ═══════════════════════════════════════════════
# فایل ذخیره‌سازی پلان‌ها
# ═══════════════════════════════════════════════
PLANS_FILE = DATA_DIR / "plans.json"


def load_plans() -> list:
    if not PLANS_FILE.exists():
        return []
    try:
        with open(PLANS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def save_plans(plans: list):
    with open(PLANS_FILE, "w", encoding="utf-8") as f:
        json.dump(plans, f, ensure_ascii=False, indent=2)


# ═══════════════════════════════════════════════
# Static files
# ═══════════════════════════════════════════════
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/renders", StaticFiles(directory=str(RENDER_DIR)), name="renders")


# ═══════════════════════════════════════════════
# صفحه‌ی اصلی
# ═══════════════════════════════════════════════
@app.get("/")
def root():
    return FileResponse(str(STATIC_DIR / "index.html"))


# ═══════════════════════════════════════════════
# API: آپلود عکس
# ═══════════════════════════════════════════════
@app.post("/api/upload")
async def upload_floor_plan(floorPlan: UploadFile = File(...)):
    if floorPlan is None or not floorPlan.filename:
        raise HTTPException(400, "فایلی ارسال نشد")

    ext = os.path.splitext(floorPlan.filename)[1].lower()
    allowed_ext = [".jpg", ".jpeg", ".png", ".webp"]
    if ext not in allowed_ext:
        raise HTTPException(400, "فقط تصویر مجاز است (jpg, png, webp)")

    timestamp = int(time.time() * 1000)
    unique_name = f"{timestamp}-{os.urandom(4).hex()}{ext}"
    dest_path = UPLOAD_DIR / unique_name

    total = 0
    try:
        with open(dest_path, "wb") as f:
            while True:
                chunk = await floorPlan.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_FILE_SIZE:
                    f.close()
                    dest_path.unlink(missing_ok=True)
                    raise HTTPException(400, "حجم فایل بیش از حد مجاز است")
                f.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(500, f"خطا در ذخیره: {e}")

    return {
        "success": True,
        "url": f"/uploads/{unique_name}",
        "filename": unique_name,
        "size": total,
    }


# ═══════════════════════════════════════════════
# API: تشخیص خطوط + پله
# ═══════════════════════════════════════════════
@app.post("/api/detect-lines")
async def detect_lines_api(request: Request):
    try:
        body = await request.json()
        fn = body.get("filename")

        if not fn:
            raise HTTPException(400, "عکسی ارسال نشد")

        # جلوگیری از path traversal
        safe_name = Path(fn).name
        if not safe_name or safe_name != fn:
            raise HTTPException(400, "نام فایل نامعتبر")

        image_path = UPLOAD_DIR / safe_name
        if not image_path.exists():
            raise HTTPException(404, "عکس پیدا نشد")

        start = time.time()
        lines, img_w, img_h = detect_lines(str(image_path))
        stairs = detect_stairs(lines)
        wall_lines = filter_stair_lines(lines, stairs, tol=6)
        elapsed = int((time.time() - start) * 1000)

        print(f"✅ تشخیص: {len(lines)} خط کل، {len(stairs)} پله، "
              f"{len(wall_lines)} خط دیوار، {elapsed}ms")

        return {
            "success": True,
            "elapsed": elapsed,
            "totalDetected": len(lines),
            "imageWidth": img_w,
            "imageHeight": img_h,
            "lines": wall_lines,
            "stairs": stairs,
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, str(e))


# ═══════════════════════════════════════════════
# API: رندر نهایی
# ═══════════════════════════════════════════════
@app.post("/api/render")
def re_render(req: ReRenderRequest):
    try:
        img = render_plan(
            lines=req.lines,
            stairs=req.stairs,
            rooms=req.rooms,
            doors=req.doors,
            windows=req.windows,
            texts=req.texts,
            arrows=req.arrows,
            rects=req.rects,
            circles=req.circles,
            compass=req.compass,
            layers=req.layers,
            style=req.style,
            title=req.title,
            image_width=req.imageWidth,
            image_height=req.imageHeight,
        )

        timestamp = int(time.time() * 1000)
        render_name = f"plan-{timestamp}.png"
        dest = RENDER_DIR / render_name
        img.save(dest, "PNG", optimize=True)

        return {
            "success": True,
            "renderedUrl": f"/renders/{render_name}",
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, str(e))


# ═══════════════════════════════════════════════
# API: ذخیره و بازیابی پلان‌ها
# ═══════════════════════════════════════════════
@app.post("/api/plans")
def create_plan(req: SavePlanRequest):
    plans = load_plans()
    new_plan = {
        "id": int(time.time() * 1000),
        "objects": req.objects,
        "stairs": req.stairs,
        "imageWidth": req.imageWidth,
        "imageHeight": req.imageHeight,
        "style": req.style,
        "title": req.title,
        "compass": req.compass,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    plans.append(new_plan)
    save_plans(plans)
    return {"success": True, "plan": new_plan}


@app.get("/api/plans")
def list_plans():
    return load_plans()


# ═══════════════════════════════════════════════
# اجرا
# ═══════════════════════════════════════════════
if __name__ == "__main__":
    import uvicorn
    print(f"🚀 Melka Editor در حال اجرا روی http://localhost:{PORT}")
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=False)