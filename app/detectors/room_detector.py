"""پیدا کردن اتاق‌ها از تقاطع خطوط"""


def find_rooms(lines):
    h_lines = [l for l in lines if abs(l["y1"] - l["y2"]) < 3]
    v_lines = [l for l in lines if abs(l["x1"] - l["x2"]) < 3]

    if len(h_lines) < 2 or len(v_lines) < 2:
        return []

    corners = []
    for hl in h_lines:
        y = hl["y1"]
        xm = min(hl["x1"], hl["x2"])
        xM = max(hl["x1"], hl["x2"])
        for vl in v_lines:
            x = vl["x1"]
            ym = min(vl["y1"], vl["y2"])
            yM = max(vl["y1"], vl["y2"])
            if xm - 5 <= x <= xM + 5 and ym - 5 <= y <= yM + 5:
                if not any(abs(c["x"] - x) < 5 and abs(c["y"] - y) < 5
                           for c in corners):
                    corners.append({"x": x, "y": y})

    if len(corners) < 4:
        return []

    rooms = []
    used = set()
    n = len(corners)

    for i in range(n):
        if i in used:
            continue
        c1 = corners[i]
        for j in range(n):
            if j == i or j in used:
                continue
            c2 = corners[j]
            if abs(c1["y"] - c2["y"]) > 8:
                continue
            if c2["x"] <= c1["x"] + 30:
                continue

            for k in range(n):
                if k in (i, j) or k in used:
                    continue
                c3 = corners[k]
                if abs(c1["x"] - c3["x"]) > 8:
                    continue
                if c3["y"] <= c1["y"] + 30:
                    continue

                for li in range(n):
                    if li in (i, j, k) or li in used:
                        continue
                    c4 = corners[li]
                    if abs(c2["x"] - c4["x"]) > 8:
                        continue
                    if abs(c3["y"] - c4["y"]) > 8:
                        continue

                    w = c2["x"] - c1["x"]
                    h = c3["y"] - c1["y"]
                    if w < 50 or h < 50:
                        continue

                    rooms.append({"x": c1["x"], "y": c1["y"], "w": w, "h": h})
                    used.update([i, j, k, li])
                    break
                if i in used:
                    break
            if i in used:
                break

    filtered = []
    for r in rooms:
        inside = False
        for other in rooms:
            if r is other:
                continue
            if (r["x"] >= other["x"] and r["y"] >= other["y"] and
                r["x"] + r["w"] <= other["x"] + other["w"] and
                r["y"] + r["h"] <= other["y"] + other["h"]):
                inside = True
                break
        if not inside:
            filtered.append(r)

    return filtered