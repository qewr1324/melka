"""Melka - سرور اصلی پروژه (All-in-One Python)"""

import os
import time
import json
import shutil
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
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


app = FastAPI(title="Melka - نقشه‌ساز خانه")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═══════════════════════════════════════════════
# Pydantic models
# ═══════════════════════════════════════════════
class DetectRequest(BaseModel):
    filename: str


class SavePlanRequest(BaseModel):
    walls: list = []
    rooms: list = []
    stairs: list = []
    lines: list = []
    imageWidth: int = 1000
    imageHeight: int = 700
    doors: list = []
    windows: list = []
    compass: dict = None
    layers: dict = None
    style: str = "modern"
    title: str = ""


class ReRenderRequest(BaseModel):
    lines: list = []
    stairs: list = []
    rooms: list = []
    doors: list = []
    windows: list = []
    compass: dict = None
    layers: dict = None
    style: str = "modern"
    title: str = ""
    imageWidth: int = 1000
    imageHeight: int = 700


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
app.mount("/three", StaticFiles(directory=str(STATIC_DIR / "three")), name="three")


# ═══════════════════════════════════════════════
# صفحه‌ی اصلی
# ═══════════════════════════════════════════════
@app.get("/")
def root():
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/three.html")
def three_page():
    return FileResponse(str(STATIC_DIR / "three.html"))


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
# API: تشخیص خطوط + پله + رندر
# ═══════════════════════════════════════════════
@app.post("/api/detect-lines")
async def detect_lines_api(request: Request):
    try:
        content_type = request.headers.get("content-type", "")

        image_path = None

        if "multipart/form-data" in content_type:
            form = await request.form()
            file = form.get("floorPlan")
            if file and hasattr(file, "filename"):
                ext = os.path.splitext(file.filename)[1].lower()
                timestamp = int(time.time() * 1000)
                unique_name = f"{timestamp}-{os.urandom(4).hex()}{ext}"
                image_path = UPLOAD_DIR / unique_name
                content = await file.read()
                with open(image_path, "wb") as f:
                    f.write(content)
            else:
                body = await request.json()
                fn = body.get("filename")
                if fn:
                    image_path = UPLOAD_DIR / fn

        else:
            body = await request.json()
            fn = body.get("filename")
            if not fn:
                raise HTTPException(400, "عکسی ارسال نشد")
            image_path = UPLOAD_DIR / fn

        if image_path is None or not Path(image_path).exists():
            raise HTTPException(404, "عکس پیدا نشد")

        start = time.time()
        lines, img_w, img_h = detect_lines(str(image_path))

        stairs = detect_stairs(lines)

        wall_lines = filter_stair_lines(lines, stairs, tol=6)

        elapsed = int((time.time() - start) * 1000)

        print(f"✅ تشخیص: {len(lines)} خط کل، {len(stairs)} پله، "
              f"{len(wall_lines)} خط دیوار، {elapsed}ms")

        rendered_url = None
        try:
            rendered_path = render_plan(
                lines=wall_lines,
                stairs=stairs,
                image_width=img_w,
                image_height=img_h,
            )

            timestamp = int(time.time() * 1000)
            render_name = f"plan-{timestamp}.png"
            dest_render = RENDER_DIR / render_name

            if isinstance(rendered_path, str):
                shutil.copyfile(rendered_path, dest_render)
            else:
                rendered_path.save(dest_render, "PNG", optimize=True)

            rendered_url = f"/renders/{render_name}"
        except Exception as render_err:
            import traceback
            traceback.print_exc()
            print(f"⚠️ خطا در رندر: {render_err}")

        return {
            "success": True,
            "elapsed": elapsed,
            "totalDetected": len(lines),
            "imageWidth": img_w,
            "imageHeight": img_h,
            "lines": wall_lines,
            "stairs": stairs,
            "renderedUrl": rendered_url,
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, str(e))


# ═══════════════════════════════════════════════
# API: رندر مجدد با تنظیمات جدید
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
        "walls": req.walls,
        "rooms": req.rooms,
        "stairs": req.stairs,
        "lines": req.lines,
        "imageWidth": req.imageWidth,
        "imageHeight": req.imageHeight,
        "doors": req.doors,
        "windows": req.windows,
        "compass": req.compass,
        "layers": req.layers,
        "style": req.style,
        "title": req.title,
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
    print(f"🚀 Melka در حال اجرا روی http://localhost:{PORT}")
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=False)