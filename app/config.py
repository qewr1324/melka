"""تنظیمات کلی پروژه"""

from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
STATIC_DIR = BASE_DIR / "static"
UPLOAD_DIR = BASE_DIR / "uploads"
RENDER_DIR = BASE_DIR / "renders"
DATA_DIR = BASE_DIR / "data"

for d in [STATIC_DIR, UPLOAD_DIR, RENDER_DIR, DATA_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# سرور
HOST = "0.0.0.0"
PORT = 3000

# عکس
MAX_IMAGE_WIDTH = 1000
MAX_FILE_SIZE = 15 * 1024 * 1024

# تشخیص خطوط
CANNY_LOW = 30
CANNY_HIGH = 100
HOUGH_THRESHOLD = 40
HOUGH_MIN_LINE_LENGTH = 40
HOUGH_MAX_LINE_GAP = 15
MIN_LINE_LENGTH = 35

# تشخیص پله
STAIR_MIN_STEPS = 4
STAIR_MAX_STEPS = 30
STAIR_MIN_GAP = 5
STAIR_MAX_GAP = 60
STAIR_TOLERANCE = 0.4

# فیلتر
STAIR_FILTER_TOL = 6

# رندر
DEFAULT_OUTPUT_WIDTH = 1400
DEFAULT_OUTPUT_HEIGHT = 1000
DEFAULT_BACKGROUND = "#FAFBFC"
DEFAULT_WALL_COLOR = "#2C3E50"

ROOM_COLORS = [
    "#E8F4F8", "#FEF5E7", "#EAFAF1", "#F4ECF7",
    "#FDEDEC", "#FEF9E7", "#EBF5FB", "#E8F8F5",
    "#FDF2E9", "#EAF2F8",
]

FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/tahoma.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]


# ═══════════════════════════════════════════════
# تنظیمات جدید: رنگ اتاق بر اساس نوع
# ═══════════════════════════════════════════════
ROOM_TYPE_COLORS = {
    "bedroom":        "#DBEAFE",
    "master_bedroom": "#C7D2FE",
    "kids_room":      "#FCE7F3",
    "living_room":    "#FEF3C7",
    "guest_room":     "#FEF9C3",
    "kitchen":        "#FEE2E2",
    "open_kitchen":   "#FECACA",
    "bathroom":       "#D1FAE5",
    "wc":             "#DCFCE7",
    "balcony":        "#E0F2FE",
    "terrace":        "#E0F2FE",
    "storage":        "#E5E7EB",
    "parking":        "#D1D5DB",
    "corridor":       "#F3F4F6",
    "entrance":       "#FDE68A",
    "study":          "#EDE9FE",
    "office":         "#EDE9FE",
    "unknown":        "#F5F5F5",
}

ROOM_TYPE_FA = {
    "bedroom": "اتاق خواب",
    "master_bedroom": "اتاق مستر",
    "kids_room": "اتاق کودک",
    "living_room": "پذیرایی",
    "guest_room": "اتاق مهمان",
    "kitchen": "آشپزخانه",
    "open_kitchen": "آشپزخانه اپن",
    "bathroom": "حمام",
    "wc": "سرویس",
    "balcony": "بالکن",
    "terrace": "تراس",
    "storage": "انباری",
    "parking": "پارکینگ",
    "corridor": "راهرو",
    "entrance": "ورودی",
    "study": "مطالعه",
    "office": "دفتر کار",
    "unknown": "اتاق",
}

# نمادهای در و پنجره
DOOR_COLOR = "#8B4513"
WINDOW_COLOR = "#3498DB"

# قطب‌نما
COMPASS_COLOR = "#2C3E50"

# استایل نقشه
STYLE_MODERN = "modern"
STYLE_BLUEPRINT = "blueprint"
STYLE_MINIMAL = "minimal"

BLUEPRINT_BG = "#0B3D91"
BLUEPRINT_WALL = "#FFFFFF"
BLUEPRINT_ACCENT = "#7FB3FF"