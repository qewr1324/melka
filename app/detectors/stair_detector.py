"""تشخیص پله از روی خطوط موازی نزدیک به هم"""

from app.config import (
    STAIR_MIN_STEPS, STAIR_MAX_STEPS,
    STAIR_MIN_GAP, STAIR_MAX_GAP, STAIR_TOLERANCE,
)


def detect_stairs(lines):
    if len(lines) < STAIR_MIN_STEPS:
        return []

    h_lines = [l for l in lines if l.get("orientation") == "h"]
    v_lines = [l for l in lines if l.get("orientation") == "v"]

    used_ids = set()

    stairs_h = _find_clusters_h(
        h_lines, STAIR_MIN_STEPS, STAIR_MAX_STEPS,
        STAIR_MIN_GAP, STAIR_MAX_GAP, STAIR_TOLERANCE, used_ids,
    )
    remaining_v = [l for l in v_lines if id(l) not in used_ids]
    stairs_v = _find_clusters_v(
        remaining_v, STAIR_MIN_STEPS, STAIR_MAX_STEPS,
        STAIR_MIN_GAP, STAIR_MAX_GAP, STAIR_TOLERANCE, used_ids,
    )

    all_stairs = stairs_h + stairs_v

    filtered = []
    for s in all_stairs:
        inside = False
        for other in all_stairs:
            if s is other:
                continue
            if (s["x"] >= other["x"] and s["y"] >= other["y"] and
                s["x"] + s["width"] <= other["x"] + other["width"] and
                s["y"] + s["height"] <= other["y"] + other["height"]):
                inside = True
                break
        if not inside:
            filtered.append(s)

    filtered.sort(key=lambda s: s["step_count"], reverse=True)
    return filtered


def _find_clusters_h(h_lines, min_steps, max_steps,
                     min_gap, max_gap, tolerance, used_ids):
    if len(h_lines) < min_steps:
        return []

    sorted_lines = sorted(h_lines, key=lambda l: l["y1"])
    stairs = []
    i = 0

    while i < len(sorted_lines):
        cluster = [sorted_lines[i]]
        j = i + 1
        last_gap = None

        while j < len(sorted_lines):
            prev = cluster[-1]
            curr = sorted_lines[j]
            gap = curr["y1"] - prev["y1"]

            if gap < min_gap or gap > max_gap:
                break

            lp = prev["length"]
            lc = curr["length"]
            if lp == 0 or lc == 0:
                break
            if min(lp, lc) / max(lp, lc) < 0.6:
                break

            xov = min(prev["x2"], curr["x2"]) - max(prev["x1"], curr["x1"])
            if xov < 0.5 * min(lp, lc):
                break

            if last_gap is not None:
                if abs(gap - last_gap) / max(last_gap, 1) > tolerance:
                    break

            cluster.append(curr)
            last_gap = gap
            j += 1

        if min_steps <= len(cluster) <= max_steps:
            stair = _build_horizontal(cluster)
            if stair:
                stairs.append(stair)
                for line in cluster:
                    used_ids.add(id(line))
                i = j
                continue

        i += 1

    return stairs


def _find_clusters_v(v_lines, min_steps, max_steps,
                     min_gap, max_gap, tolerance, used_ids):
    if len(v_lines) < min_steps:
        return []

    sorted_lines = sorted(v_lines, key=lambda l: l["x1"])
    stairs = []
    i = 0

    while i < len(sorted_lines):
        cluster = [sorted_lines[i]]
        j = i + 1
        last_gap = None

        while j < len(sorted_lines):
            prev = cluster[-1]
            curr = sorted_lines[j]
            gap = curr["x1"] - prev["x1"]

            if gap < min_gap or gap > max_gap:
                break

            lp = prev["length"]
            lc = curr["length"]
            if lp == 0 or lc == 0:
                break
            if min(lp, lc) / max(lp, lc) < 0.6:
                break

            yov = min(prev["y2"], curr["y2"]) - max(prev["y1"], curr["y1"])
            if yov < 0.5 * min(lp, lc):
                break

            if last_gap is not None:
                if abs(gap - last_gap) / max(last_gap, 1) > tolerance:
                    break

            cluster.append(curr)
            last_gap = gap
            j += 1

        if min_steps <= len(cluster) <= max_steps:
            stair = _build_vertical(cluster)
            if stair:
                stairs.append(stair)
                for line in cluster:
                    used_ids.add(id(line))
                i = j
                continue

        i += 1

    return stairs


def _build_horizontal(cluster):
    if len(cluster) < 4:
        return None

    x_min = min(l["x1"] for l in cluster)
    x_max = max(l["x2"] for l in cluster)
    y_min = cluster[0]["y1"]
    y_max = cluster[-1]["y1"]

    width = x_max - x_min
    height = y_max - y_min

    if width < 30 or width > 400:
        return None
    if height < 25 or height > 600:
        return None

    aspect = width / height if height > 0 else 0
    if aspect < 0.1 or aspect > 10:
        return None

    spacing = height / (len(cluster) - 1) if len(cluster) > 1 else 0

    return {
        "type": "stairs",
        "orientation": "h",
        "x": float(x_min),
        "y": float(y_min),
        "width": float(width),
        "height": float(height),
        "step_count": len(cluster),
        "step_spacing": float(spacing),
        "direction": "up",
        "confidence": _confidence(cluster),
        "lines": [
            {"x1": float(l["x1"]), "y1": float(l["y1"]),
             "x2": float(l["x2"]), "y2": float(l["y2"])}
            for l in cluster
        ],
    }


def _build_vertical(cluster):
    if len(cluster) < 4:
        return None

    x_min = cluster[0]["x1"]
    x_max = cluster[-1]["x1"]
    y_min = min(l["y1"] for l in cluster)
    y_max = max(l["y2"] for l in cluster)

    width = x_max - x_min
    height = y_max - y_min

    if height < 30 or height > 400:
        return None
    if width < 25 or width > 600:
        return None

    aspect = height / width if width > 0 else 0
    if aspect < 0.1 or aspect > 10:
        return None

    spacing = width / (len(cluster) - 1) if len(cluster) > 1 else 0

    return {
        "type": "stairs",
        "orientation": "v",
        "x": float(x_min),
        "y": float(y_min),
        "width": float(width),
        "height": float(height),
        "step_count": len(cluster),
        "step_spacing": float(spacing),
        "direction": "up",
        "confidence": _confidence(cluster),
        "lines": [
            {"x1": float(l["x1"]), "y1": float(l["y1"]),
             "x2": float(l["x2"]), "y2": float(l["y2"])}
            for l in cluster
        ],
    }


def _confidence(cluster):
    if len(cluster) < 4:
        return 0.0

    orientation = cluster[0].get("orientation")
    if orientation == "h":
        gaps = [cluster[i + 1]["y1"] - cluster[i]["y1"]
                for i in range(len(cluster) - 1)]
    else:
        gaps = [cluster[i + 1]["x1"] - cluster[i]["x1"]
                for i in range(len(cluster) - 1)]

    lengths = [l["length"] for l in cluster]

    avg_gap = sum(gaps) / len(gaps) if gaps else 0
    if avg_gap == 0:
        return 0.0
    gv = sum((g - avg_gap) ** 2 for g in gaps) / len(gaps)
    gs = gv ** 0.5
    gap_score = max(0, 1 - (gs / avg_gap) * 2)

    avg_len = sum(lengths) / len(lengths)
    if avg_len == 0:
        return 0.0
    lv = sum((l - avg_len) ** 2 for l in lengths) / len(lengths)
    ls = lv ** 0.5
    len_score = max(0, 1 - (ls / avg_len) * 3)

    count = len(cluster)
    if 8 <= count <= 15:
        cs = 1.0
    elif 5 <= count <= 20:
        cs = 0.7
    else:
        cs = 0.4

    return round(gap_score * 0.5 + len_score * 0.3 + cs * 0.2, 3)