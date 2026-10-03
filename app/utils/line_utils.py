"""توابع کمکی برای پردازش خطوط"""

import numpy as np


def merge_collinear(lines, dist=10, gap=30):
    if not lines:
        return []

    merged = []
    horizontal = [i for i, l in enumerate(lines) if l.get("orientation") == "h"]
    vertical = [i for i, l in enumerate(lines) if l.get("orientation") != "h"]

    def merge_group(indices, is_h):
        group = [lines[i] for i in indices]
        used = [False] * len(group)

        for i in range(len(group)):
            if used[i]:
                continue
            cur = dict(group[i])
            changed = True
            while changed:
                changed = False
                for j in range(len(group)):
                    if i == j or used[j]:
                        continue
                    o = group[j]

                    if is_h:
                        if abs(cur["y1"] - o["y1"]) > dist:
                            continue
                        if o["x1"] > cur["x2"] + gap:
                            continue
                        if o["x2"] < cur["x1"] - gap:
                            continue
                        nx1 = min(cur["x1"], o["x1"])
                        nx2 = max(cur["x2"], o["x2"])
                        ny = (cur["y1"] + o["y1"]) / 2
                        cur = {
                            "x1": nx1, "y1": ny,
                            "x2": nx2, "y2": ny,
                            "length": float(nx2 - nx1),
                            "orientation": "h",
                        }
                        used[j] = True
                        changed = True
                    else:
                        if abs(cur["x1"] - o["x1"]) > dist:
                            continue
                        if o["y1"] > cur["y2"] + gap:
                            continue
                        if o["y2"] < cur["y1"] - gap:
                            continue
                        ny1 = min(cur["y1"], o["y1"])
                        ny2 = max(cur["y2"], o["y2"])
                        nx = (cur["x1"] + o["x1"]) / 2
                        cur = {
                            "x1": nx, "y1": ny1,
                            "x2": nx, "y2": ny2,
                            "length": float(ny2 - ny1),
                            "orientation": "v",
                        }
                        used[j] = True
                        changed = True

            merged.append(cur)

    merge_group(horizontal, True)
    merge_group(vertical, False)
    return merged


def remove_duplicates(lines, dist=10):
    if not lines:
        return []

    lines = sorted(lines, key=lambda l: l["length"], reverse=True)
    result = []

    for line in lines:
        dup = False
        for kept in result:
            if line.get("orientation") != kept.get("orientation"):
                continue
            d1 = np.hypot(line["x1"] - kept["x1"], line["y1"] - kept["y1"])
            d2 = np.hypot(line["x2"] - kept["x2"], line["y2"] - kept["y2"])
            d3 = np.hypot(line["x1"] - kept["x2"], line["y1"] - kept["y2"])
            d4 = np.hypot(line["x2"] - kept["x1"], line["y2"] - kept["y1"])
            if min(d1, d2, d3, d4) < dist:
                dup = True
                break
        if not dup:
            result.append(line)

    return result


def snap_endpoints(lines, tolerance=25):
    if not lines:
        return lines

    h_lines = [l for l in lines if l.get("orientation") == "h"]
    v_lines = [l for l in lines if l.get("orientation") == "v"]
    result = []

    for h in h_lines:
        h = dict(h)
        y = h["y1"]
        for ep in ["x1", "x2"]:
            best = None
            bd = tolerance
            for v in v_lines:
                if v["y1"] - tolerance <= y <= v["y2"] + tolerance:
                    d = abs(h[ep] - v["x1"])
                    if d < bd:
                        bd = d
                        best = v["x1"]
            if best is not None:
                h[ep] = best
        h["length"] = abs(h["x2"] - h["x1"])
        if h["length"] >= 30:
            result.append(h)

    for v in v_lines:
        v = dict(v)
        x = v["x1"]
        for ep in ["y1", "y2"]:
            best = None
            bd = tolerance
            for h in h_lines:
                if h["x1"] - tolerance <= x <= h["x2"] + tolerance:
                    d = abs(v[ep] - h["y1"])
                    if d < bd:
                        bd = d
                        best = h["y1"]
            if best is not None:
                v[ep] = best
        v["length"] = abs(v["y2"] - v["y1"])
        if v["length"] >= 30:
            result.append(v)

    return result


def extend_to_corners(lines, tolerance=30):
    if not lines:
        return lines

    h_lines = [l for l in lines if l.get("orientation") == "h"]
    v_lines = [l for l in lines if l.get("orientation") == "v"]
    result = []

    for h in h_lines:
        h = dict(h)
        y = h["y1"]
        cands = []
        for v in v_lines:
            if v["y1"] - tolerance <= y <= v["y2"] + tolerance:
                if v["x1"] <= h["x1"] + tolerance:
                    cands.append((abs(h["x1"] - v["x1"]), v["x1"], "l"))
                if v["x1"] >= h["x2"] - tolerance:
                    cands.append((abs(h["x2"] - v["x1"]), v["x1"], "r"))

        left = sorted([c for c in cands if c[2] == "l"])
        right = sorted([c for c in cands if c[2] == "r"])
        if left:
            h["x1"] = left[0][1]
        if right:
            h["x2"] = right[0][1]

        h["length"] = abs(h["x2"] - h["x1"])
        if h["length"] >= 30:
            result.append(h)

    for v in v_lines:
        v = dict(v)
        x = v["x1"]
        cands = []
        for h in h_lines:
            if h["x1"] - tolerance <= x <= h["x2"] + tolerance:
                if h["y1"] <= v["y1"] + tolerance:
                    cands.append((abs(v["y1"] - h["y1"]), h["y1"], "t"))
                if h["y1"] >= v["y2"] - tolerance:
                    cands.append((abs(v["y2"] - h["y1"]), h["y1"], "b"))

        top = sorted([c for c in cands if c[2] == "t"])
        bot = sorted([c for c in cands if c[2] == "b"])
        if top:
            v["y1"] = top[0][1]
        if bot:
            v["y2"] = bot[0][1]

        v["length"] = abs(v["y2"] - v["y1"])
        if v["length"] >= 30:
            result.append(v)

    return result