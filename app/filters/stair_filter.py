"""فیلتر هوشمند خطوط پله از خطوط دیوار"""


def filter_stair_lines(lines, stairs, tol=6):
    if not stairs:
        return lines

    result = []
    for line in lines:
        line_len = ((line["x1"] - line["x2"]) ** 2 +
                    (line["y1"] - line["y2"]) ** 2) ** 0.5

        remove = False
        for stair in stairs:
            sx1 = stair["x"] - tol
            sy1 = stair["y"] - tol
            sx2 = stair["x"] + stair["width"] + tol
            sy2 = stair["y"] + stair["height"] + tol

            p1 = sx1 <= line["x1"] <= sx2 and sy1 <= line["y1"] <= sy2
            p2 = sx1 <= line["x2"] <= sx2 and sy1 <= line["y2"] <= sy2

            if not (p1 and p2):
                continue

            sw = stair["width"]
            sh = stair["height"]

            if abs(line_len - sw) < tol * 4 or abs(line_len - sh) < tol * 4:
                remove = True
                break

            if line_len < min(sw, sh) * 0.95:
                remove = True
                break

        if not remove:
            result.append(line)

    return result


def is_stair_line(line, stairs, tol=6):
    """برای رندر — آیا این خط داخل پله است؟"""
    if not stairs:
        return False

    ll = ((line["x1"] - line["x2"]) ** 2 +
          (line["y1"] - line["y2"]) ** 2) ** 0.5

    for s in stairs:
        sx1 = s["x"] - tol
        sy1 = s["y"] - tol
        sx2 = s["x"] + s["width"] + tol
        sy2 = s["y"] + s["height"] + tol

        p1 = sx1 <= line["x1"] <= sx2 and sy1 <= line["y1"] <= sy2
        p2 = sx1 <= line["x2"] <= sx2 and sy1 <= line["y2"] <= sy2
        if not (p1 and p2):
            continue

        sw = s["width"]
        sh = s["height"]
        if abs(ll - sw) < tol * 4 or abs(ll - sh) < tol * 4:
            return True
        if ll < min(sw, sh) * 0.95:
            return True

    return False