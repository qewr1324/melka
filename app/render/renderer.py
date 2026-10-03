"""رندر حرفه‌ای نقشه‌ی دوبعدی - نسخه‌ی ارتقا یافته"""

from PIL import Image, ImageDraw, ImageFont
import math

from app.config import (
    DEFAULT_OUTPUT_WIDTH, DEFAULT_OUTPUT_HEIGHT,
    DEFAULT_BACKGROUND, DEFAULT_WALL_COLOR,
    ROOM_COLORS,
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
    else:
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
# اتاق‌ها
# ═══════════════════════════════════════════════
def _draw_rooms(draw, rooms, sx, sy, style_cfg, font_big, font_small, show_labels=True):
    if not rooms:
        return

    for i, room in enumerate(rooms):
        x1 = int(room["x"] * sx) + 3
        y1 = int(room["y"] * sy) + 3
        x2 = int((room["x"] + room["w"]) * sx) - 3
        y2 = int((room["y"] + room["h"]) * sy) - 3

        if x2 <= x1 or y2 <= y1:
            continue

        if style_cfg["use_room_fill"]:
            room_type = room.get("type", "unknown")
            color = ROOM_TYPE_COLORS.get(
                room_type,
                ROOM_COLORS[i % len(ROOM_COLORS)],
            )
            draw.rounded_rectangle((x1, y1, x2, y2), radius=10, fill=color)

        if show_labels:
            name = room.get("name") or _get_default_name(room, i)
            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2

            bb = draw.textbbox((0, 0), name, font=font_big)
            tw = bb[2] - bb[0]

            if style_cfg["use_room_fill"]:
                draw.rounded_rectangle(
                    (cx - tw // 2 - 8, cy - 16, cx + tw // 2 + 8, cy + 8),
                    radius=6, fill="#FFFFFF",
                )
            draw.text(
                (cx - tw // 2, cy - 14),
                name,
                fill=style_cfg["text"],
                font=font_big,
            )

            area_m2 = (room["w"] * room["h"]) / 10000
            area_text = f"{area_m2:.1f} m²"
            bb2 = draw.textbbox((0, 0), area_text, font=font_small)
            tw2 = bb2[2] - bb2[0]
            draw.text(
                (cx - tw2 // 2, cy + 10),
                area_text,
                fill=style_cfg["text_muted"],
                font=font_small,
            )


def _get_default_name(room, index):
    t = room.get("type", "unknown")
    if t and t != "unknown":
        return ROOM_TYPE_FA.get(t, f"اتاق {index + 1}")
    return f"اتاق {index + 1}"


# ═══════════════════════════════════════════════
# دیوارها
# ═══════════════════════════════════════════════
def _draw_walls(draw, lines, sx, sy, wall_color, wall_width):
    for line in lines:
        x1 = int(line["x1"] * sx)
        y1 = int(line["y1"] * sy)
        x2 = int(line["x2"] * sx)
        y2 = int(line["y2"] * sy)
        draw.line((x1, y1, x2, y2), fill=wall_color, width=wall_width)

    radius = wall_width // 2
    for line in lines:
        for (px, py) in [(line["x1"], line["y1"]), (line["x2"], line["y2"])]:
            cx = int(px * sx)
            cy = int(py * sy)
            draw.ellipse(
                (cx - radius, cy - radius, cx + radius, cy + radius),
                fill=wall_color,
            )


# ═══════════════════════════════════════════════
# درها
# ═══════════════════════════════════════════════
def _draw_doors(draw, doors, sx, sy, style_cfg):
    if not doors:
        return

    color = DOOR_COLOR if style_cfg["use_room_fill"] else style_cfg["wall"]

    for door in doors:
        x1 = int(door["x1"] * sx)
        y1 = int(door["y1"] * sy)
        x2 = int(door["x2"] * sx)
        y2 = int(door["y2"] * sy)

        length = int(math.hypot(x2 - x1, y2 - y1))
        if length < 4:
            continue

        angle = math.atan2(y2 - y1, x2 - x1)

        # پاک کردن بخش دیوار
        draw.line((x1, y1, x2, y2), fill=style_cfg["bg"], width=8)

        # خط در (از یک سر، عمود)
        door_angle = angle - math.pi / 2
        dx = int(x1 + math.cos(door_angle) * length)
        dy = int(y1 + math.sin(door_angle) * length)
        draw.line((x1, y1, dx, dy), fill=color, width=2)

        # قوس
        bbox = (x1 - length, y1 - length, x1 + length, y1 + length)
        start_angle = math.degrees(angle)
        end_angle = math.degrees(door_angle)

        try:
            draw.arc(bbox, start=start_angle, end=end_angle, fill=color, width=2)
        except Exception:
            pass


# ═══════════════════════════════════════════════
# پنجره‌ها
# ═══════════════════════════════════════════════
def _draw_windows(draw, windows, sx, sy, style_cfg):
    if not windows:
        return

    color = WINDOW_COLOR if style_cfg["use_room_fill"] else style_cfg["wall"]

    for win in windows:
        x1 = int(win["x1"] * sx)
        y1 = int(win["y1"] * sy)
        x2 = int(win["x2"] * sx)
        y2 = int(win["y2"] * sy)

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
            draw.line(
                (x1 + ox, y1 + oy, x2 + ox, y2 + oy),
                fill=color, width=2,
            )

        # بستن دو خط
        for (px, py) in [(x1, y1), (x2, y2)]:
            ox = int(math.cos(perp) * offset)
            oy = int(math.sin(perp) * offset)
            draw.line((px - ox, py - oy, px + ox, py + oy),
                      fill=color, width=1)


# ═══════════════════════════════════════════════
# پله
# ═══════════════════════════════════════════════
def _draw_stairs(draw, stairs, sx, sy, style_cfg, font):
    if not stairs:
        return

    line_c = "#D35400" if style_cfg["use_room_fill"] else style_cfg["wall"]
    fill_c = "#FEF5E7" if style_cfg["use_room_fill"] else None
    arrow_c = "#C0392B" if style_cfg["use_room_fill"] else style_cfg["wall"]

    for idx, s in enumerate(stairs):
        x1 = int(s["x"] * sx)
        y1 = int(s["y"] * sy)
        x2 = int((s["x"] + s["width"]) * sx)
        y2 = int((s["y"] + s["height"]) * sy)

        if fill_c:
            draw.rectangle((x1, y1, x2, y2), fill=fill_c)

        for l in s.get("lines", []):
            draw.line(
                (int(l["x1"] * sx), int(l["y1"] * sy),
                 int(l["x2"] * sx), int(l["y2"] * sy)),
                fill=line_c, width=1,
            )

        draw.rectangle((x1, y1, x2, y2), outline=line_c, width=2)

        cx = (x1 + x2) // 2
        cy = (y1 + y2) // 2

        if s.get("orientation") == "h":
            draw.line((cx, y2 - 6, cx, y1 + 6), fill=arrow_c, width=2)
            draw.polygon(
                [(cx, y1 + 4), (cx - 5, y1 + 12), (cx + 5, y1 + 12)],
                fill=arrow_c,
            )
        else:
            draw.line((x1 + 6, cy, x2 - 6, cy), fill=arrow_c, width=2)
            draw.polygon(
                [(x2 - 4, cy), (x2 - 12, cy - 5), (x2 - 12, cy + 5)],
                fill=arrow_c,
            )


# ═══════════════════════════════════════════════
# قطب‌نما
# ═══════════════════════════════════════════════
def _draw_compass(draw, x, y, size, style_cfg, direction="north"):
    cx, cy = x, y
    r = size

    outline_color = style_cfg["text"]
    fill_color = "#E74C3C" if style_cfg["use_room_fill"] else outline_color
    faded_color = style_cfg["text_muted"]

    draw.ellipse((cx - r, cy - r, cx + r, cy + r),
                 outline=outline_color, width=2)
    draw.ellipse((cx - r + 5, cy - r + 5, cx + r - 5, cy + r - 5),
                 outline=faded_color, width=1)

    angle_offset = {
        "north": 0.0,
        "south": math.pi,
        "east": math.pi / 2,
        "west": -math.pi / 2,
    }.get(direction, 0.0)

    tip_x = cx + math.sin(angle_offset) * (r - 8)
    tip_y = cy - math.cos(angle_offset) * (r - 8)

    base_left_x = cx + math.sin(angle_offset - 0.35) * (r - 12)
    base_left_y = cy - math.cos(angle_offset - 0.35) * (r - 12)

    base_right_x = cx + math.sin(angle_offset + 0.35) * (r - 12)
    base_right_y = cy - math.cos(angle_offset + 0.35) * (r - 12)

    draw.polygon(
        [(tip_x, tip_y), (base_left_x, base_left_y), (base_right_x, base_right_y)],
        fill=fill_color,
    )

    font = _load_font(int(r * 0.5))
    label = {"north": "N", "south": "S", "east": "E", "west": "W"}.get(direction, "N")
    bb = draw.textbbox((0, 0), label, font=font)
    tw = bb[2] - bb[0]
    th = bb[3] - bb[1]
    label_x = cx - tw // 2 - math.sin(angle_offset) * (r + 12)
    label_y = cy - th // 2 + math.cos(angle_offset) * (r + 12)
    draw.text((label_x, label_y), label, fill=outline_color, font=font)


# ═══════════════════════════════════════════════
# گرید
# ═══════════════════════════════════════════════
def _draw_grid(draw, width, height, style_cfg, step=50):
    color = style_cfg["grid"]
    for x in range(0, width, step):
        draw.line((x, 0, x, height), fill=color, width=1)
    for y in range(0, height, step):
        draw.line((0, y, width, y), fill=color, width=1)


# ═══════════════════════════════════════════════
# تابع اصلی
# ═══════════════════════════════════════════════
def render_plan(
    lines: list,
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
    compass: dict = None,
    title: str = "",
    output_path: str = None,
):
    if stairs is None:
        stairs = []
    if doors is None:
        doors = []
    if windows is None:
        windows = []
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

    if layers.get("grid"):
        _draw_grid(draw, output_width, output_height, style_cfg, step=40)

    wall_lines = [l for l in lines if not is_stair_line(l, stairs, tol=6)]

    if rooms is None:
        rooms = find_rooms(wall_lines)

    font_big = _load_font(22)
    font_small = _load_font(14)
    font_stair = _load_font(12)

    if layers.get("rooms"):
        _draw_rooms(
            draw, rooms, sx, sy, style_cfg,
            font_big, font_small,
            show_labels=layers.get("roomLabels", True),
        )

    if layers.get("walls"):
        wall_width = max(3, int(output_width / 350 * style_cfg["wall_width_mult"]))
        _draw_walls(draw, wall_lines, sx, sy, style_cfg["wall"], wall_width)

    if layers.get("windows"):
        _draw_windows(draw, windows, sx, sy, style_cfg)

    if layers.get("doors"):
        _draw_doors(draw, doors, sx, sy, style_cfg)

    if layers.get("stairs"):
        _draw_stairs(draw, stairs, sx, sy, style_cfg, font_stair)

    if layers.get("compass") and compass:
        _draw_compass(
            draw,
            x=compass.get("x", output_width - 80),
            y=compass.get("y", output_height - 80),
            size=compass.get("size", 40),
            style_cfg=style_cfg,
            direction=compass.get("direction", "north"),
        )

    if title:
        font_title = _load_font(26)
        draw.text((30, 20), title, fill=style_cfg["text"], font=font_title)

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