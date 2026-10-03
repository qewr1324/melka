"""تشخیص خطوط از عکس پلان"""

import os
import cv2
import numpy as np

from app.config import (
    MAX_IMAGE_WIDTH, CANNY_LOW, CANNY_HIGH,
    HOUGH_THRESHOLD, HOUGH_MIN_LINE_LENGTH, HOUGH_MAX_LINE_GAP,
    MIN_LINE_LENGTH,
)
from app.utils.line_utils import (
    merge_collinear, remove_duplicates, snap_endpoints, extend_to_corners,
)


def detect_lines(image_path: str):
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"عکس پیدا نشد: {image_path}")

    img = cv2.imread(image_path)
    if img is None:
        raise ValueError("cv2 نتونست عکس رو بخونه")

    h, w = img.shape[:2]
    target_h = int(h * MAX_IMAGE_WIDTH / w)
    img = cv2.resize(img, (MAX_IMAGE_WIDTH, target_h))

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    binary = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        15, 5,
    )

    blurred = cv2.GaussianBlur(binary, (3, 3), 0)
    edges = cv2.Canny(blurred, CANNY_LOW, CANNY_HIGH, apertureSize=3)

    kernel = np.ones((2, 2), np.uint8)
    edges = cv2.dilate(edges, kernel, iterations=1)

    raw_lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=HOUGH_THRESHOLD,
        minLineLength=HOUGH_MIN_LINE_LENGTH,
        maxLineGap=HOUGH_MAX_LINE_GAP,
    )

    if raw_lines is None:
        return [], MAX_IMAGE_WIDTH, target_h

    result = []
    for line in raw_lines:
        x1, y1, x2, y2 = line[0]
        length = float(np.hypot(x2 - x1, y2 - y1))
        if length < MIN_LINE_LENGTH:
            continue

        dx = x2 - x1
        dy = y2 - y1
        angle = np.degrees(np.arctan2(dy, dx))
        if angle < 0:
            angle += 180

        if angle < 20 or angle > 160:
            avg_y = (y1 + y2) / 2
            nx1 = float(min(x1, x2))
            nx2 = float(max(x1, x2))
            result.append({
                "x1": nx1, "y1": float(avg_y),
                "x2": nx2, "y2": float(avg_y),
                "length": float(nx2 - nx1),
                "orientation": "h",
            })
        elif 70 < angle < 110:
            avg_x = (x1 + x2) / 2
            ny1 = float(min(y1, y2))
            ny2 = float(max(y1, y2))
            result.append({
                "x1": float(avg_x), "y1": ny1,
                "x2": float(avg_x), "y2": ny2,
                "length": float(ny2 - ny1),
                "orientation": "v",
            })

    if not result:
        return [], MAX_IMAGE_WIDTH, target_h

    result = merge_collinear(result, dist=10, gap=30)
    result = remove_duplicates(result, dist=10)
    result = [l for l in result if l["length"] >= 40]
    result = snap_endpoints(result, tolerance=25)
    result = merge_collinear(result, dist=10, gap=30)
    result = extend_to_corners(result, tolerance=30)
    result = merge_collinear(result, dist=10, gap=30)
    result = remove_duplicates(result, dist=10)

    result.sort(key=lambda l: l["length"], reverse=True)
    return result, MAX_IMAGE_WIDTH, target_h