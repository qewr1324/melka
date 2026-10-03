"""رندر حرفه‌ای نقشه‌ی دوبعدی"""

from PIL import Image, ImageDraw, ImageFont
import math

from app.config import (
    DEFAULT_OUTPUT_WIDTH, DEFAULT_OUTPUT_HEIGHT,
    DEFAULT_BACKGROUND, DEFAULT_WALL_COLOR,
    ROOM_TYPE_COLORS, ROOM_TYPE_FA,
    DOOR_COLOR, WINDOW_COLOR,
    STYLE_MODERN, STYLE_BLUEPRINT, STYLE_MINIMAL,
    BLUEPRINT_BG, BLUEPRINT_WALL, BLUEPRINT_ACCENT,
    FONT_PATHS, RENDER_DIR,
)
from app.detectors.room_detector import find_rooms
from app.filters.stair_filter import is_stair_line


# ═══════════════════════════════════════════════
# فونت
# ═══════════════════════════════════════════════
def _load_font(size: int):
    for p in FONT_PATHS:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()


# ═══════════════════════════════════════════════
# استایل
# ═══════════════════════════════════════════════
def _resolve_style(style: str):
    if style == STYLE_BLUEPRINT:
        return {
            "bg": BLUEPRINT_BG,
            "wall": BLUEPRINT_WALL,
            "text": "#FFFFFF",
            "text_muted": BLUEPRINT_ACCENT,
            "grid": "#1E5AA8",
            "use_room_fill": False,
            "wall_width_mult": 1.3,
        }
    elif style == STYLE_MINIMAL:
        return {
            "bg": "#FFFFFF",
            "wall": "#111111",
            "text": "#111111",
            "text_muted": "#888888",
            "grid": "#EEEEEE",
            "use_room_fill": False,
            "wall_width_mult": 1.0,
        }
    return {
        "bg": DEFAULT_BACKGROUND,
        "wall": DEFAULT_WALL_COLOR,
        "text": "#2C3E50",
        "text_muted": "#7F8C8D",
        "grid": "#E5E7EB",
        "use_room_fill": True,
        "wall_width_mult": 1.0,
    }


# ═══════════════════════════════════════════════
# اتاق
# ═══════════════════════════════════════════════
def _draw_rooms(draw, rooms, sx, sy, style_cfg, font_big, font_small):
    for i, room in enumerate(rooms):
        x1 = int(room["x"] * sx) + 3
        y1 = int(room["y"] * sy) + 3
        x2 = int((room["x"] + room["w"]) * sx) - 3
        y2 = int((room["y"] + room["h"]) * sy) - 3
        if x2 <= x1 or y2 <= y1:
            continue

        if style_cfg["use_room_fill"]:
            room_type = room.get("type", "unknown")
            color = ROOM_TYPE_COLORS.get(room_type, "#F5F5F5")
            draw.rounded_rectangle((x1, y1, x2, y2), radius=8, fill=color)

        if room.get("name"):
            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2
            try:
                draw.text((cx, cy), room["name"],
                          fill=style_cfg["text"], font=font_big, anchor="mm")
            except Exception:
                draw.text((cx, cy), room["name"],
                          fill=style_cfg["text"], font=font_big)


# ═══════════════════════════════════════════════
# دیوار
# ═══════════════════════════════════════════════
def _draw_walls(draw, lines, sx, sy, style_cfg, base_width):
    for line in lines:
        x1 = int(line["x1"] * sx)
        y1 = int(line["y1"] * sy)
        x2 = int(line["x2"] * sx)
        y2 = int(line["y2"] * sy)
        color = line.get("color", style_cfg["wall"])
        w = line.get("width")
        width = max(1, int((w if w else base_width) * style_cfg["wall_width_mult"]))
        draw.line((x1, y1, x2, y2), fill=color, width=width)


# ═══════════════════════════════════════════════
# در
# ═══════════════════════════════════════════════
def _draw_doors(draw, doors, sx, sy, style_cfg):
    for door in doors:
        x1 = int(door["x1"] * sx)
        y1 = int(door["y1"] * sy)
        x2 = int(door["x2"] * sx)
        y2 = int(door["y2"] * sy)
        color = door.get("color", DOOR_COLOR)

        length = int(math.hypot(x2 - x1, y2 - y1))
        if length < 4:
            continue

        angle = math.atan2(y2 - y1, x2 - x1)

        # پاک کردن بخش دیوار
        draw.line((x1, y1, x2, y2), fill=style_cfg["bg"], width=8)

        # خط در
        door_angle = angle - math.pi / 2
        dx = int(x1 + math.cos(door_angle) * length)
        dy = int(y1 + math.sin(door_angle) * length)
        draw.line((x1, y1, dx, dy), fill=color, width=2)

        # قوس
        bbox = (x1 - length, y1 - length, x1 + length, y1 + length)
        start_deg = math.degrees(angle)
        end_deg = math.degrees(door_angle)
        try:
            draw.arc(bbox, start=start_deg, end=end_deg, fill=color, width=2)
        except Exception:
            pass


# ═══════════════════════════════════════════════
# پنجره
# ═══════════════════════════════════════════════
def _draw_windows(draw, windows, sx, sy, style_cfg):
    for win in windows:
        x1 = int(win["x1"] * sx)
        y1 = int(win["y1"] * sy)
        x2 = int(win["x2"] * sx)
        y2 = int(win["y2"] * sy)
        color = win.get("color", WINDOW_COLOR)

        length = math.hypot(x2 - x1, y2 - y1)
        if length < 4:
            continue

        angle = math.atan2(y2 - y1, x2 - x1)
        perp = angle + math.pi / 2
        offset = 4

        # پاک کردن بخش دیوار
        draw.line((x1, y1, x2, y2), fill=style_cfg["bg"], width=8)

        # دو خط موازی
        for sign in (-1, 1):
            ox = int(math.cos(perp) * offset * sign)
            oy = int(math.sin(perp) * offset * sign)
            draw.line((x1 + ox, y1 + oy, x2 + ox, y2 + oy),
                      fill=color, width=2)


# ═══════════════════════════════════════════════
# پله
# ═══════════════════════════════════════════════
def _draw_stairs(draw, stairs, sx, sy, style_cfg, font):
    for s in stairs:
        x1 = int(s["x"] * sx)
        y1 = int(s["y"] * sy)
        x2 = int((s["x"] + s["width"]) * sx)
        y2 = int((s["y"] + s["height"]) * sy)

        line_c = "#D35400" if style_cfg["use_room_fill"] else style_cfg["wall"]

        if style_cfg["use_room_fill"]:
            draw.rectangle((x1, y1, x2, y2), fill="#FEF5E7")

        for l in s.get("lines", []):
            draw.line(
                (int(l["x1"] * sx), int(l["y1"] * sy),
                 int(l["x2"] * sx), int(l["y2"] * sy)),
                fill=line_c, width=1,
            )

        draw.rectangle((x1, y1, x2, y2), outline=line_c, width=2)


# ═══════════════════════════════════════════════
# متن
# ═══════════════════════════════════════════════
def _draw_texts(draw, texts, sx, sy):
    if not texts:
        return

    for t in texts:
        font_size = int(t.get("fontSize", 20) * min(sx, sy))
        font = _load_font(max(10, font_size))
        text = t.get("text", "")
        if not text:
            continue

        x = int(t["x"] * sx)
        y = int(t["y"] * sy)

        # پس‌زمینه
        bg = t.get("bg")
        if bg and bg.lower() not in ("transparent", "none"):
            bb = draw.textbbox((0, 0), text, font=font)
            tw = bb[2] - bb[0]
            th = bb[3] - bb[1]
            pad = 4
            draw.rounded_rectangle(
                (x - tw - pad, y - pad, x + pad, y + th + pad),
                radius=4, fill=bg,
            )

        try:
            draw.text((x, y), text,
                      fill=t.get("color", "#2C3E50"),
                      font=font, anchor="ra")
        except Exception:
            draw.text((x, y), text,
                      fill=t.get("color", "#2C3E50"), font=font)


# ═══════════════════════════════════════════════
# فلش
# ═══════════════════════════════════════════════
def _draw_arrows(draw, arrows, sx, sy):
    if not arrows:
        return

    for a in arrows:
        x1 = int(a["x1"] * sx)
        y1 = int(a["y1"] * sy)
        x2 = int(a["x2"] * sx)
        y2 = int(a["y2"] * sy)
        color = a.get("color", "#E74C3C")
        width = max(1, int(a.get("width", 3) * min(sx, sy)))

        draw.line((x1, y1, x2, y2), fill=color, width=width)

        angle = math.atan2(y2 - y1, x2 - x1)
        head_len = max(12, int(20 * min(sx, sy)))
        head_w = head_len * 0.5

        ax = x2 - math.cos(angle) * head_len
        ay = y2 - math.sin(angle) * head_len
        perp = angle + math.pi / 2

        pts = [
            (x2, y2),
            (ax + math.cos(perp) * head_w, ay + math.sin(perp) * head_w),
            (ax - math.cos(perp) * head_w, ay - math.sin(perp) * head_w),
        ]
        draw.polygon(pts, fill=color)


# ═══════════════════════════════════════════════
# مستطیل
# ═══════════════════════════════════════════════
def _draw_rects(draw, rects, sx, sy):
    if not rects:
        return

    for r in rects:
        x1 = int(r["x"] * sx)
        y1 = int(r["y"] * sy)
        x2 = int((r["x"] + r["w"]) * sx)
        y2 = int((r["y"] + r["h"]) * sy)
        color = r.get("color", "#3498DB")
        width = max(1, int(r.get("width", 2) * min(sx, sy)))
        fill = r.get("fill", "transparent")

        if fill and fill.lower() not in ("transparent", "none"):
            draw.rectangle((x1, y1, x2, y2), fill=fill)
        draw.rectangle((x1, y1, x2, y2), outline=color, width=width)


# ═══════════════════════════════════════════════
# دایره
# ═══════════════════════════════════════════════
def _draw_circles(draw, circles, sx, sy):
    if not circles:
        return

    for c in circles:
        cx = int(c["x"] * sx)
        cy = int(c["y"] * sy)
        rr = int(c["r"] * min(sx, sy))
        color = c.get("color", "#9B59B6")
        width = max(1, int(c.get("width", 2) * min(sx, sy)))
        fill = c.get("fill", "transparent")

        bbox = (cx - rr, cy - rr, cx + rr, cy + rr)
        if fill and fill.lower() not in ("transparent", "none"):
            draw.ellipse(bbox, fill=fill)
        draw.ellipse(bbox, outline=color, width=width)


# ═══════════════════════════════════════════════
# قطب‌نما
# ═══════════════════════════════════════════════
def _draw_compass(draw, x, y, size, style_cfg, direction="north"):
    cx, cy = x, y
    r = size
    outline_color = style_cfg["text"]
    fill_color = "#E74C3C" if style_cfg["use_room_fill"] else outline_color

    draw.ellipse((cx - r, cy - r, cx + r, cy + r),
                 outline=outline_color, width=2)

    angle_offset = {
        "north": 0.0,
        "south": math.pi,
        "east": math.pi / 2,
        "west": -math.pi / 2,
    }.get(direction, 0.0)

    tip_x = cx + math.sin(angle_offset) * (r - 8)
    tip_y = cy - math.cos(angle_offset) * (r - 8)
    bl_x = cx + math.sin(angle_offset - 0.35) * (r - 12)
    bl_y = cy - math.cos(angle_offset - 0.35) * (r - 12)
    br_x = cx + math.sin(angle_offset + 0.35) * (r - 12)
    br_y = cy - math.cos(angle_offset + 0.35) * (r - 12)

    draw.polygon([(tip_x, tip_y), (bl_x, bl_y), (br_x, br_y)], fill=fill_color)


# ═══════════════════════════════════════════════
# تابع اصلی
# ═══════════════════════════════════════════════
def render_plan(
    lines: list = None,
    stairs: list = None,
    image_width: int = 1000,
    image_height: int = 700,
    output_width: int = DEFAULT_OUTPUT_WIDTH,
    output_height: int = DEFAULT_OUTPUT_HEIGHT,
    style: str = STYLE_MODERN,
    layers: dict = None,
    rooms: list = None,
    doors: list = None,
    windows: list = None,
    texts: list = None,
    arrows: list = None,
    rects: list = None,
    circles: list = None,
    compass: dict = None,
    title: str = "",
    output_path: str = None,
):
    lines = lines or []
    stairs = stairs or []
    doors = doors or []
    windows = windows or []
    texts = texts or []
    arrows = arrows or []
    rects = rects or []
    circles = circles or []

    if layers is None:
        layers = {
            "walls": True, "rooms": True, "roomLabels": True,
            "stairs": True, "doors": True, "windows": True,
            "compass": True, "grid": False,
        }

    style_cfg = _resolve_style(style)
    sx = output_width / image_width
    sy = output_height / image_height

    img = Image.new("RGB", (output_width, output_height), style_cfg["bg"])
    draw = ImageDraw.Draw(img)

    wall_lines = [l for l in lines if not is_stair_line(l, stairs, tol=6)]

    if rooms is None:
        rooms = find_rooms(wall_lines)

    font_big = _load_font(20)
    font_small = _load_font(12)

    # ۱. اتاق‌ها
    if layers.get("rooms", True) and rooms:
        _draw_rooms(draw, rooms, sx, sy, style_cfg, font_big, font_small)

    # ۲. دیوارها
    if layers.get("walls", True):
        _draw_walls(draw, wall_lines, sx, sy, style_cfg, 4)

    # ۳. پنجره‌ها
    if layers.get("windows", True):
        _draw_windows(draw, windows, sx, sy, style_cfg)

    # ۴. درها
    if layers.get("doors", True):
        _draw_doors(draw, doors, sx, sy, style_cfg)

    # ۵. پله‌ها
    if layers.get("stairs", True):
        _draw_stairs(draw, stairs, sx, sy, style_cfg, font_small)

    # ۶. اشیاء گرافیکی (مستطیل، دایره، فلش، متن)
    if rects:
        _draw_rects(draw, rects, sx, sy)
    if circles:
        _draw_circles(draw, circles, sx, sy)
    if arrows:
        _draw_arrows(draw, arrows, sx, sy)
    if texts:
        _draw_texts(draw, texts, sx, sy)

    # ۷. قطب‌نما
    if layers.get("compass", True) and compass:
        _draw_compass(
            draw,
            x=compass.get("x", output_width - 80),
            y=compass.get("y", output_height - 80),
            size=compass.get("size", 40),
            style_cfg=style_cfg,
            direction=compass.get("direction", "north"),
        )

    # ۸. عنوان
    if title:
        title_font = _load_font(26)
        draw.text((30, 20), title, fill=style_cfg["text"], font=title_font)

    if output_path:
        img.save(output_path, "PNG", optimize=True)

    return img


def render_plan_to_file(
    lines, stairs=None,
    image_width=1000, image_height=700,
    output_path: str = None,
    **kwargs,
) -> str:
    if output_path is None:
        output_path = str(RENDER_DIR / "output.png")
    img = render_plan(lines, stairs, image_width, image_height, **kwargs)
    img.save(output_path, "PNG", optimize=True)
    return output_path